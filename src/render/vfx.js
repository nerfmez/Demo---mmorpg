// Skill and combat effects. Reads game events and live projectiles/areas; never changes the game.
// Shapes follow the gameplay hit areas (arc, radius, path), so what you see is what hits.
// Everything is placed on the terrain; flat shapes are ground-hugging decals.
import * as THREE from 'three';
import { groundDust } from './ground-dust.js';
import { soundPulse } from './sound-pulse.js';
import { disposeObject } from './dispose.js';
import { Particles } from './particles.js';
import { toon } from './toon.js';
import { makeDecal, conform } from './decal.js';
import { BladeTrail } from './trail.js';
import FX from '../../data/combat-fx.json';
import LEGACY_FIRE from '../../data/fireball-legacy.json';
import STAFF_CAST from '../../data/staff-cast.json';
import { flameMesh as legacyFlameMesh, FlameParticles } from './firebolt.js';
import { v5FlameMesh } from './fireball-v5.js';
import { frostMesh } from './frost-v2.js';
import { approvedMesh } from './approved-mesh-clips.js';
import { poseEcho, echoOpacity } from './pose-echo.js';
import { artSurface, healingMaterial, plusGeometry, keys, faceGameCamera } from './authored-surfaces.js';
import { cutRibbon, approvedCut, ContactShards } from './melee.js';
import { arrowStreak, rockGeometry, RockChips } from './physical.js';

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
const COASTAL_CONTACTS = new Set(['slap', 'peck', 'pinch', 'scythe', 'claw', 'rend', 'rake', 'shove']);
const RING_TELLS = new Set(['slam', 'stomp', 'shards', 'whirl']);

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
    const tip=new THREE.BufferGeometry();tip.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.085,0,-.19,0,.065,-.14, 0,0,0,0,.065,-.14,.085,0,-.19, 0,0,0,.085,0,-.19,0,-.065,-.14, 0,0,0,0,-.065,-.14,-.085,0,-.19],3));tip.computeVertexNormals();
    const feathers=[];
    for(const a of [0,Math.PI/2,Math.PI]){const x=Math.cos(a)*.09,y=Math.sin(a)*.09;feathers.push(0,0,-.46,x,y,-.63,x,y,-.69,0,0,-.46,x,y,-.69,0,0,-.59);}
    const fletch=new THREE.BufferGeometry();fletch.setAttribute('position',new THREE.Float32BufferAttribute(feathers,3));fletch.computeVertexNormals();
    arrowGeo = {
      shaft: new THREE.CylinderGeometry(.022,.022,.46,6).rotateX(Math.PI/2).translate(0,0,-.29),tip,fletch,
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
    this.fireRelease = new THREE.Vector3();
    this.fireReleasePending = false;
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

  clearFireballs() {
    this.endCast();
    for (const [id, mesh] of this.projectiles) {
      if (!mesh.userData.fireball) continue;
      disposeObject(mesh, this.sharedGeo); this.projectiles.delete(id);
    }
    let live = 0;
    for (const a of this.active) {
      if (a.obj.userData.fireball || a.obj.userData.v5) disposeObject(a.obj, this.sharedGeo);
      else this.active[live++] = a;
    }
    this.active.length = live;
    this.flames.count = 0; this.flames.mesh.geometry.instanceCount = 0;
    this.fireReleasePending = false;
  }

  fireConfig() {
    return (this.fireballReviewVersion || this.config.skills.firebolt.version) === 'legacy' ? LEGACY_FIRE : this.config.skills.firebolt;
  }

  fireMesh(mode = 0) {
    return (this.fireballReviewVersion || this.config.skills.firebolt.version) === 'legacy'
      ? legacyFlameMesh(LEGACY_FIRE, mode)
      : v5FlameMesh(this.config.skills.firebolt, mode);
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
    this.fireReleasePending = false;
    if (e.skill === 'frost_nova' && element === 'cold') {
      const mesh=frostMesh(4.2,true);mesh.visible=false;this.scene.add(mesh);
      this.castFrost={mesh,t:0,dur:e.total};return;
    }
    if (e.skill === 'hunter_shot') {
      const cfg = this.config.skills.hunter_shot, f = cfg.cast, mesh = arrowStreak(cfg);
      mesh.material.uniforms.uLength.value = f.length; mesh.material.uniforms.uWidth.value = f.width;
      mesh.material.uniforms.uOpacity.value = f.opacity; mesh.visible = false; this.scene.add(mesh);
      this.castArrow = { mesh, t: 0, dur: e.total, weapon: e.weapon }; return;
    }
    if (e.skill !== 'firebolt' || element !== 'fire') return;
    const mesh = this.fireMesh(1);
    mesh.material.uniforms.uWidth.value = this.fireConfig().cast.size;
    mesh.material.uniforms.uGlowRadius.value = this.fireConfig().cast.glowRadius;
    // Hidden until updateCast supplies an actual source rig (event x/z is the target).
    mesh.visible = false;
    this.scene.add(mesh);
    this.castFlame = { mesh, t: 0, dur: e.total, weapon: e.weapon, angle: e.angle };
  }

  endCast() {
    if (this.castFrost) disposeObject(this.castFrost.mesh,this.sharedGeo);
    this.castFrost=null;
    if (this.castArrow) { disposeObject(this.castArrow.mesh); this.castArrow = null; }
    if (!this.castFlame) return;
    disposeObject(this.castFlame.mesh);
    this.castFlame = null;
  }

  updateCast(dt, rig, cancelled = false, player = null) {
    if (this.castFrost) {
      const f=this.castFrost;f.t+=dt;
      if(cancelled||!rig||f.t>=f.dur)this.endCast();
      else {f.mesh.position.copy(rig.root.position);f.mesh.visible=true;f.mesh.material.uniforms.uFrame.value=Math.min(6,f.t/f.dur*7);}
    }
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
    if (cancelled || !rig || c.t >= c.dur) {
      if (c.mesh.userData.v5 && c.mesh.visible && rig && !player?.dead && !player?.dash && c.t >= c.dur) {
        this.fireRelease.copy(c.mesh.position);this.fireReleasePending = true;
      }
      this.endCast(); return;
    }
    const w = rig.bones?.weapon;
    if (c.mesh.userData.v5 && w && c.weapon === 'staff') {
      // Keep charge physically attached to the actual staff head. The staff-only
      // cast pose raises this same socket ahead of the actor before release.
      w.updateWorldMatrix(true, false);
      w.localToWorld(_p0.set(0,0,STAFF_CAST.tip));
      c.mesh.material.uniforms.uVelocity.value.set(Math.sin(c.angle),0,Math.cos(c.angle));
    } else if (w && c.weapon !== 'none') {
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
    u.uTime.value = c.mesh.userData.v5 ? k * .625 : c.t;
    const f = this.fireConfig().cast;
    if (c.mesh.userData.v5) {
      // Gather into the existing staff socket within the unchanged cast time.
      // The final charge size and release/flight geometry stay as approved.
      const growth = Math.min(1, k / f.growFraction);
      u.uScale.value = f.minScale + (1.05 - f.minScale) * growth * growth * (3 - 2 * growth);
      u.uChargeBuild.value = k;
      u.uProgress.value = k;
    } else u.uScale.value = 0.25 + 0.75 * k * k;
  }

  fireImpact(e) {
    const cfg = this.fireConfig(), f = cfg.impact;
    const y = this.gy(e.x, e.z) + (e.y ?? 1.0);
    const flash = this.fireMesh(2);
    flash.position.set(e.x, y, e.z);
    flash.userData.fireball = true;
    flash.material.uniforms.uWidth.value = f.size;
    flash.material.uniforms.uGlowRadius.value = f.glowRadius;
    flash.material.uniforms.uSeed.value = Math.random() * 17;
    if (Number.isFinite(e.vx) && Number.isFinite(e.vz)) flash.material.uniforms.uVelocity.value.set(e.vx, 0, e.vz);
    // Reuse the nearest last-rendered Firebolt direction; core events stay unchanged.
    let nearest = Infinity;
    for (const v of this.projectiles.values()) {
      if (Number.isFinite(e.vx) && Number.isFinite(e.vz)) break;
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
    this.spawn(flash, flash.userData.v5 ? f.contactLife : f.flashLife, (k) => {
      const u = flash.material.uniforms;
      u.uTime.value = k * f.flashLife;
      u.uProgress.value = k;
      u.uScale.value = 1;
      u.uAlpha.value = flash.userData.v5 ? 1 : 1 - k;
    });
    for (let i = 0; !flash.userData.v5 && i < f.wisps + f.embers; i++) {
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
    this.swingLeft = e.total - this.swingDelay + look.cast.trailEnd;
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
    const cut = e.element==='physical' ? approvedCut(cfg,e.range,arc,e.step===1) : cutRibbon(cfg, e.range, arc, e.step === 1, e.finisher);
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
      const approved=e.element==='physical';
      const m=approved?approvedCut(cfg,e.radius*(i?.82:1),189*Math.PI/180,false,true,i):cutRibbon(cfg,e.radius,(cfg.swing.arc ?? 205)*Math.PI/180,i===1);
      m.position.set(e.x,this.gy(e.x,e.z)+cfg.swing.height,e.z);
      m.rotation.y=e.angle+(approved?0:i*Math.PI);
      this.spawn(m,cfg.swing.life,(t)=>{m.material.uniforms.uT.value=t;m.rotation.y=e.angle+(approved?0:i*Math.PI+t*(cfg.swing.turn ?? 1.65));});
    }
  }

  nova(e) {
    if (e.approvedFrost && e.element === 'cold') {
      const mesh=frostMesh(e.radius);mesh.position.set(e.x,this.gy(e.x,e.z),e.z);
      this.spawn(mesh,19/30,t=>{mesh.material.uniforms.uFrame.value=7+t*19;});return;
    }
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
    const m = new THREE.Mesh(g, slashMaterial(this.config.swingColors?.[e.name] || 0xff8a5a));
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
    if (e.kind === 'slam' || e.kind === 'pound' || e.kind === 'stomp') return this.slam(e);
    if (e.kind === 'shards') return this.shardBurst(e);
    if (e.kind === 'quake') return this.quakeBurst(e);
    if (e.kind === 'pounce') return this.dive(e);
    if (e.kind === 'leap') return this.leapLand(e);
    if (e.kind === 'dive') return this.dive(e);
    if (e.kind === 'rock') return this.rockLand(e);
    const c = el(e.element);
    this.fx.burst(e.x, this.gy(e.x, e.z) + 0.3, e.z, 18, { color: c.dots, size: 0.35, speed: e.radius * 2.5, life: 0.5, up: 0.4 });
  }

  stoneBurst(e) {
    if(e.element==='physical'||!e.element){this.playApproved('stone-burst',e);this.shake=Math.max(this.shake,this.config.skills.stone_burst.impact.shake);return;}
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
    this.chips.burst(e, cold ? { ...cfg, colors: { ...cfg.colors, debris: '#dff4ff' } } : cfg, this.gy(e.x, e.z));
    this.dust.burst(e.x, this.gy(e.x, e.z) + .15, e.z, f.dust, { color: cold ? '#e6f6ff' : cfg.colors.debris, size: f.dustSize, sizeEnd: f.dustSize * 1.4, speed: 1.6, life: f.dustLife, up: .3, drag: 5 });
    this.shake = Math.max(this.shake, cfg.impact.shake);
  }

  /** One eruption of the warden's quake line: a short column of rubble and dust. */
  quakeBurst(e) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 12, { color: 0xb49a78, size: 0.8, sizeEnd: 1.5, speed: e.radius * 1.4, life: 0.7, up: 0.9, drag: 3 });
    this.fx.burst(e.x, y + 0.4, e.z, 8, { color: 0xffb070, size: 0.25, speed: e.radius * 1.8, life: 0.4, up: 2.2 });
    this.ring(e.x, e.z, e.radius, 0xffb070, 0.3);
    this.shake = Math.max(this.shake, 0.12);
  }

  slam(e) {
    const y = this.gy(e.x, e.z);
    this.dust.burst(e.x, y + 0.2, e.z, 26, { color: 0xb49a78, size: 1.0, sizeEnd: 1.8, speed: e.radius * 2.2, life: 0.8, up: 0.25, drag: 3 });
    this.ring(e.x, e.z, e.radius, 0xffb070, 0.4);
    this.shake = Math.max(this.shake, e.kind === 'pound' ? 0.25 : 0.35);
  }

  playApproved(name,e) {
    const mesh=approvedMesh(name,e.radius);mesh.position.set(e.x,this.gy(e.x,e.z),e.z);
    this.spawn(mesh,mesh.userData.clipLife,t=>{mesh.material.uniforms.uFrame.value=t*(mesh.userData.clipFrames-1);});
  }

  leapLand(e) {
    this.playApproved('leap',e);groundDust(this,e,this.config.skills.leap.dust);this.shake=Math.max(this.shake,.15);
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
    if (e.element === 'lightning' || !e.element) {
      for(let i=1;i<e.points.length;i++)this.playApproved('lightning',{x:e.points[i][0],z:e.points[i][1]});
      return;
    }
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
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3,m=artSurface('movement',[.5,0,.5,.5]),life=26/60;
      faceGameCamera(m);
      this.spawn(m,life,t=>{const age=t*26-i*2,k=Math.max(0,Math.min(1,age/22));m.visible=age>=0;m.position.set(e.x+Math.cos(angle)*(.55-.2*k),this.gy(e.x,e.z)+.2+.65*k,e.z+Math.sin(angle)*(.45-.15*k));m.scale.set(.85*(.6+.2*Math.sin(Math.PI*k)),.85*(.6+.6*k),1);m.material.uniforms.uAlpha.value=.3*Math.sin(Math.PI*k);m.material.uniforms.uDissolve.value=.1+k*.85;m.material.uniforms.uTime.value=age/60;});
    }
    this.fx.burst(e.x,this.gy(e.x,e.z)+.2,e.z,8,{color:0xaaddff,size:.10,sizeEnd:.01,speed:1.2,up:1,life:28/60,drag:3});
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
    const cfg=this.config.skills.war_cry.pulse;
    for(let i=0;i<2;i++){
      const m=soundPulse(cfg),delay=i*cfg.echoDelay,life=cfg.life+delay;
      m.position.set(e.x,this.gy(e.x,e.z)+.22,e.z);
      this.spawn(m,life,t=>{const age=t*life-delay,k=Math.max(0,age/cfg.life);m.visible=age>=0;const radius=.45+(e.radius*cfg.visualRadiusScale-.45)*(1-Math.pow(1-k,2));m.scale.set(radius,1,radius);m.material.uniforms.uT.value=k;m.material.uniforms.uAlpha.value=cfg.opacity*(i?.6:1)*Math.min(1,k/.06)*Math.pow(1-k,1.4);});
    }
    this.shake=Math.max(this.shake,.12);
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

  /** Rune sentinel: shards burst out over the marked ring, cyan sparks and a ring wave. */
  shardBurst(e) {
    const y = this.gy(e.x, e.z);
    this.fx.burst(e.x, y + 0.9, e.z, 22, { color: 0x9ff0ff, size: 0.3, speed: e.radius * 2.4, life: 0.45, up: 0.15 });
    this.dust.burst(e.x, y + 0.2, e.z, 12, { color: 0xa9a99a, size: 0.7, sizeEnd: 1.2, speed: e.radius * 1.8, life: 0.6, up: 0.2, drag: 3 });
    this.ring(e.x, e.z, e.radius, 0x7fe3ee, 0.35);
  }

  /** Rune sentinel beam: a bright line along the locked aim that fades fast. */
  beam(e) {
    if (e.kind === 'lash') return this.lash(e);
    // a thin bright core inside a soft cyan sheath, read as a beam from the high camera
    const core = new THREE.Mesh(new THREE.CylinderGeometry(e.width * 0.14, e.width * 0.14, e.length, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, e.length / 2), additive(0xd8fbff, 0.95));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(e.width * 0.42, e.width * 0.42, e.length, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, e.length / 2), additive(0x3fc6dc, 0.35));
    const group = new THREE.Group();
    group.add(glow, core);
    group.position.set(e.x, this.gy(e.x, e.z) + 1.4, e.z);
    group.rotation.y = e.angle;
    this.spawn(group, 0.4, (t) => {
      core.material.opacity = 0.95 * (1 - t);
      glow.material.opacity = 0.35 * (1 - t);
      const thin = 1 - t * 0.7;
      core.scale.set(thin, thin, 1);
      glow.scale.set(1 + t * 0.5, 1 + t * 0.5, 1);
    });
    for (let i = 0; i < 10; i++) {
      const d = (i / 9) * e.length, x = e.x + Math.sin(e.angle) * d, z = e.z + Math.cos(e.angle) * d;
      this.fx.add(x, this.gy(x, z) + 0.2, z, 0, 1.2, 0, { color: 0x9ff0ff, size: 0.28, sizeEnd: 0.05, life: 0.4, drag: 2 });
    }
  }

  /** Viper fang lash: a quick pale-green streak with a few venom drops. */
  lash(e) {
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(e.width * 0.5, e.length, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, e.length / 2), additive(0xc8ff8a, 0.85));
    streak.position.set(e.x, this.gy(e.x, e.z) + 0.5, e.z);
    streak.rotation.y = e.angle;
    streak.renderOrder = 6;
    this.spawn(streak, 0.22, (t) => {
      streak.material.opacity = 0.85 * (1 - t);
      streak.scale.x = 1 - t * 0.8;
    });
    for (let i = 0; i < 6; i++) {
      const d = e.length * (0.4 + 0.6 * (i / 5)), x = e.x + Math.sin(e.angle) * d, z = e.z + Math.cos(e.angle) * d;
      this.fx.add(x, this.gy(x, z) + 0.5, z, 0, 1.4, 0, { color: 0x9be04a, size: 0.22, sizeEnd: 0.05, life: 0.35, gravity: 6, drag: 1 });
    }
  }

  lob(e) {
    if (e.kind === 'venom') return this.venomLob(e);
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

  venomLob(e) {
    // a glob of venom arcing from the viper's mouth to the marked pool
    const glob = new THREE.Mesh(this.venomGeo || (this.venomGeo = Object.assign(new THREE.SphereGeometry(0.15, 8, 6), { userData: { shared: true } })), toon('#9adf4a', { emissive: '#4f8a2a', emissiveIntensity: 0.4 }));
    const y0 = this.gy(e.fromX, e.fromZ) + 0.9, y1 = this.gy(e.x, e.z) + 0.2;
    this.spawn(glob, e.duration, (t) => {
      glob.position.set(e.fromX + (e.x - e.fromX) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 2.2, e.fromZ + (e.z - e.fromZ) * t);
      if (Math.random() < 0.5) this.fx.add(glob.position.x, glob.position.y, glob.position.z, 0, -0.5, 0, { color: 0xb6ec4a, size: 0.16, sizeEnd: 0.03, life: 0.35 });
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

  blink(fromX, fromZ, x, z, color = 0xb4a2ff, rig = null) {
    if(!rig){this.fx.burst(fromX,this.gy(fromX,fromZ)+1,fromZ,16,{color,size:.3,speed:3,life:.4,up:1});this.fx.burst(x,this.gy(x,z)+1,z,16,{color,size:.3,speed:3,life:.4,up:1});return;}
    for(let i=0;i<2;i++){
      const m=artSurface('movement',[i*.5,0,.5,.5]);m.position.set(i?x:fromX,this.gy(i?x:fromX,i?z:fromZ)+.9,i?z:fromZ);faceGameCamera(m);
      this.spawn(m,21/60,t=>{const age=t*21-i;m.visible=age>=0;m.scale.set(2.1*(.35+.55*Math.min(1,age/20)),2.1*(.8+.32*Math.min(1,age/20)),1);m.material.uniforms.uAlpha.value=1-Math.max(0,(age-4)/16);m.material.uniforms.uDissolve.value=Math.max(0,(age-3)/17)*.95;m.material.uniforms.uTime.value=age/60;});
    }
    const ghost=poseEcho(rig.root,0x9152ca);ghost.position.set(fromX,this.gy(fromX,fromZ),fromZ);
    this.spawn(ghost,.2,t=>echoOpacity(ghost,.28*(1-t)));
  }

  syncMovement(player,y,dt,rig) {
    const d=player.dash;
    if(!d){this.movementSource=null;return;}
    if(d.kind==='blink'||d.kind==='leap')return;
    if(this.movementSource!==d){
      this.movementSource=d;this.movementEcho=0;this.movementDust=0;
      if(d.kind==='dash'){
        const m=artSurface('movement',[0,.5,.5,.5]);faceGameCamera(m);const speed=Math.hypot(d.vx,d.vz)||1,dx=d.vx/speed,dz=d.vz/speed;
        // Resolve screen direction without rotating the camera-facing plane away.
        m.rotation.z=-Math.atan2(dz*.815,dx);const life=d.dur+13/60;
        this.spawn(m,life,t=>{const age=t*life,k=Math.max(0,(age-d.dur)/(13/60));if(age<=d.dur||t===0)m.position.set(player.x-dx*.9,y+.67,player.z-dz*.9);m.scale.set(2.8*(1-.6*k),2.8*(.3-.12*k),1);m.material.uniforms.uAlpha.value=Math.min(1,age/(2/60))*.7*(1-k);m.material.uniforms.uDissolve.value=k*.9;m.material.uniforms.uTime.value=age;});
      }
    }
    if(d.kind==='dash'){
      while(this.movementEcho<2&&d.t>=(this.movementEcho===0?3/60:7/60)){const ghost=poseEcho(rig.root,0x83bdde);this.spawn(ghost,.2,t=>echoOpacity(ghost,.15*(1-t)));this.movementEcho++;}
    }else if(d.kind==='roll'){
      while(this.movementDust<3&&d.t>=d.dur*(this.movementDust===0?.18:this.movementDust===1?.5:.78)){
        const m=artSurface('movement',[.5,.5,.5,.5],.45);faceGameCamera(m);m.position.set(player.x,y+.16,player.z);this.movementDust++;
        this.spawn(m,.25,t=>{m.scale.set(1.2*(.2+.95*t),1.2*(.15+.31*t),1);m.position.y=y+.12+.15*t;m.material.uniforms.uAlpha.value=.36*Math.sin(Math.PI*t);m.material.uniforms.uDissolve.value=t*.9;m.material.uniforms.uTime.value=t*.25;});
      }
    }
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
          const m = this.fireMesh();
          m.material.uniforms.uSeed.value = pr.id * 0.73;
          v.add(m);
          v.userData.trail = 0;
          v.userData.fireTime = .625;
          v.userData.fireTravelled = 0;
          v.userData.fireball = true;
          if (m.userData.v5 && this.fireReleasePending) {
            const travelled=pr.travelled||0, speed=pr.speed||1;
            const sx=pr.x-pr.vx/speed*travelled,sz=pr.z-pr.vz/speed*travelled;
            v.userData.socketOffset=new THREE.Vector3().copy(this.fireRelease).sub(_p0.set(sx,this.gy(sx,sz)+(pr.y??1),sz));
          }
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
        const u = v.children[0].material.uniforms, cfg = this.fireConfig().projectile;
        v.userData.fireTime += dt;
        u.uTime.value = v.children[0].userData.v5 ? v.userData.fireTime : time;
        u.uVelocity.value.set(pr.vx, 0, pr.vz);
        if (v.children[0].userData.v5) {
          // Never materialize a two-metre tail behind a newly released muzzle.
          // Its back edge grows only into space the head has actually crossed.
          v.userData.fireTravelled = pr.travelled ?? (v.userData.fireTravelled + pr.speed * dt);
          u.uTravelled.value = v.userData.fireTravelled;
          if (v.userData.socketOffset) {
            const k=Math.min(1,u.uTravelled.value/cfg.launchDistance);
            v.position.addScaledVector(v.userData.socketOffset,1-k*k*(3-2*k));
          }
          const core = v.children[0].userData.launchCore;
          core.material.uniforms.uAlpha.value = Math.max(0, 1 - u.uTravelled.value / cfg.launchDistance);
          core.visible = core.material.uniforms.uAlpha.value > 0;
        }
        v.userData.trail += dt * (v.children[0].userData.v5 ? 0 : cfg.trailRate);
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
    this.fireReleasePending = false;
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        if (v.children[0]?.userData.v5) {
          const u = v.children[0].material.uniforms;
          v.userData.fireball = true;
          this.spawn(v, 2 / 24, k => {
            u.uScale.value = .72 * (1 - k);
            u.uTime.value = v.userData.fireTime + k * 2 / 24;
          });
        } else disposeObject(v, this.sharedGeo);
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
      const group=new THREE.Group(),marks=[],motes=[];
      const field=this.decal(this.discGeo,healingMaterial(),a.x,a.z,a.radius,0,.045);group.add(field);
      const edge=this.decal(ringGeometry(1-.018/a.radius,1,96),additive(0x63ffb8,.6),a.x,a.z,a.radius,0,.05);edge.material.blending=THREE.NormalBlending;group.add(edge);
      for(let i=0;i<4;i++){
        const angle=i*Math.PI/2,m=new THREE.Mesh(plusGeometry(),additive(0x9bffcd,.65));
        const x=a.x+Math.cos(angle)*(a.radius-.28),z=a.z+Math.sin(angle)*(a.radius-.28);
        m.position.set(x,this.gy(x,z)+.055,z);m.rotation.set(-Math.PI/2,0,Math.PI/4);m.material.blending=THREE.NormalBlending;group.add(m);marks.push(m);
        const g=new THREE.Mesh(new THREE.OctahedronGeometry(.04),additive(0x95ffd1,.7));g.userData.phase=i/7;g.userData.x=a.x+Math.cos(i*2.4)*(.6+i%3*.53);g.userData.z=a.z+Math.sin(i*2.4)*(.6+i%3*.53);group.add(g);motes.push(g);
      }
      const cross=new THREE.Mesh(plusGeometry(.12,.025),additive(0xbbffd2,.85));cross.position.set(a.x+1.1,this.gy(a.x+1.1,a.z-.45)+1.3,a.z-.45);cross.material.blending=THREE.NormalBlending;group.add(cross);
      return {obj:group,update:(ar,t)=>{const age=ar.t-ar.delay,fade=fadeInOut(ar);group.visible=age>=0;field.material.uniforms.uT.value=age;field.material.uniforms.uA.value=fade;edge.material.opacity=.6*fade;
        for(const m of marks)m.material.opacity=.65*fade;
        cross.material.opacity=.85*fade*Math.sin(Math.PI*((age+.6)%1));cross.position.y=this.gy(a.x+1.1,a.z-.45)+1.3+.25*((age+.6)%1);
        for(const g of motes){const q=(age+.6+g.userData.phase)%1;g.position.set(g.userData.x,this.gy(g.userData.x,g.userData.z)+.08+.75*q,g.userData.z);g.scale.setScalar(Math.max(0,Math.sin(Math.PI*q)));g.material.opacity=.7*fade;}
      }};
    }
    if (a.kind === 'stone_burst') {
      const cfg = this.config.skills.stone_burst, group = new THREE.Group();
      const boundary = this.decal(this.ringGeo, new THREE.MeshBasicMaterial({ color: cfg.colors.debris, transparent: true, depthWrite: false, opacity: cfg.cast.boundaryOpacity, side: THREE.DoubleSide }), a.x, a.z, a.radius, 0, .025);
      group.add(boundary);
      return { obj: group, update: ar => {
        group.visible = ar.t < ar.delay;
        const k = Math.min(1, ar.t / Math.max(.01, ar.delay));
        boundary.material.opacity = cfg.cast.boundaryOpacity * (.7 + .3 * k);
      } };
    }
    if (a.kind === 'venom_pool') {
      // marked like a boulder while the venom flies, then a bubbling green pool
      const tell = this.decal(this.discGeo, discMaterial('telegraph'), a.x, a.z, a.radius, 0, 0.06);
      tell.material.uniforms.uColor.value.set(0x9adf4a);
      tell.material.uniforms.uColor2.value.set(0xd6f07a);
      const pool = this.decal(this.discGeo, discMaterial('mire'), a.x, a.z, a.radius, 0, 0.07);
      pool.material.uniforms.uColor.value.set(0x4f8a2a);
      pool.material.uniforms.uColor2.value.set(0xb6ec4a);
      const group = new THREE.Group();
      group.add(tell, pool);
      return {
        obj: group,
        update: (ar, t, dt) => {
          const landed = ar.t >= ar.delay;
          tell.material.uniforms.uFill.value = Math.min(1, ar.t / Math.max(0.01, ar.delay));
          tell.material.uniforms.uA.value = landed ? 0 : 0.9;
          pool.material.uniforms.uT.value = t;
          pool.material.uniforms.uA.value = landed ? Math.min(1, (ar.t - ar.delay) * 6) * Math.min(1, (ar.delay + ar.duration - ar.t) * 2) * 0.9 : 0;
          if (landed && Math.random() < dt * 10) {
            const ang = Math.random() * Math.PI * 2, rr = Math.random() * ar.radius, x = ar.x + Math.sin(ang) * rr, z = ar.z + Math.cos(ang) * rr;
            this.fx.add(x, this.gy(x, z) + 0.15, z, 0, 0.8, 0, { color: 0xb6ec4a, size: 0.22, sizeEnd: 0.05, life: 0.6, drag: 1 });
          }
        },
      };
    }
    if (a.kind === 'stone_burst' || a.kind === 'rock' || a.kind === 'dive' || a.kind === 'pound' || a.kind === 'pounce' || a.kind === 'quake') {
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
      if (RING_TELLS.has(w.name)) kind = 'slam';
      else if (COASTAL_CONTACTS.has(w.name)) kind = 'melee';
      else if (w.name === 'charge' || w.name === 'lash' || w.name === 'quake' || w.name === 'beam') kind = 'lane';
      if (!kind) continue;
      const key = `${m.id}:${w.name}`;
      seen.add(key);
      let v = this.telegraphs.get(key);
      if (!v) {
        if (kind === 'slam') {
          const mesh = this.decal(this.discGeo, discMaterial('telegraph'), m.x, m.z, w.radius || m.def.attacks[w.name].radius, 0, 0.07);
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
          // a beam is a fixed line; a charge covers its speed over its duration
          const fixed = w.name === 'beam' || w.name === 'lash' || w.name === 'quake';
          const len = w.name === 'quake' ? atk.length : fixed ? atk.range : (atk.speed || 12) * (atk.duration || 0.4);
          const geo = new THREE.PlaneGeometry(fixed ? atk.width : m.r * 1.6, len, 1, 14).rotateX(-Math.PI / 2).translate(0, 0, len / 2);
          const mesh = makeDecal(geo, new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.25, depthWrite: false }), this.world, 0.07);
          v = { mesh, kind };
        }
        this.scene.add(v.mesh);
        this.telegraphs.set(key, v);
      }
      const k = Math.min(1, m.stateT / w.total);
      v.mesh.position.set(m.x, 0, m.z);
      if (v.kind === 'slam') {
        const r = w.radius || m.def.attacks[w.name].radius;
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
    let live = 0;
    for (const a of this.active) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.update?.(k, a);
      if (a.t >= a.dur) {
        disposeObject(a.obj, this.sharedGeo);
      } else this.active[live++] = a;
    }
    this.active.length = live;
  }
}
