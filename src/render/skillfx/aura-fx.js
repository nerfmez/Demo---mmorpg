// Buff auras (owner, 2026-10-30: the buff shouts were all one recipe in different colours, "ไม่ต่างกันเท่าไหร่";
// each buff now has its own signature that says what it does, on the cast and while it lasts). Built with the
// reference skills' techniques (.claude/skills/skill-vfx): see-through shells whose light is cut out of
// Firebolt's domain-warped noise (V5_FIELD) carried along the flow, a hot-to-cool ramp per buff, see-through
// where they face the camera; pooled, no allocation per frame. Cosmetic only.
//  - Rally / War Cry (more damage): fire bursts up off every body it reached; while it lasts the hero's weapon
//    burns (a flame along the blade), an ally's shoulders smoulder.
//  - Frenzy Roar (more speed): a ring of wind sweeps out through everyone to the true radius; while it lasts a
//    whirl of wind turns round each body's legs.
//  - Stand Firm (less damage taken): its shout stays BuffFx's (owner: that one is good); while it lasts a thin
//    blue skin of light wraps the body and ripples where a blow lands.
//  - Hold the Line: its shout stays BuffFx's shield wall; while it lasts a ring of gold runes turns under each body.
//  - Provoke: BuffFx's roar and anger marks; while it lasts a red tether runs from each provoked monster to the hero.
//  - Boiling Blood: dark red blood steam bursts off the hero; while it lasts the steam rises thicker and hotter as
//    HP falls, so it shows how strong it is.
//  - Fighting Spirit: BuffFx's green-gold ring; while it lasts each hit sends a green mote of life from the struck
//    monster back into the one who hit it.
//  - Berserk: a crimson aura blasts out with a hard shake; while it lasts a dense crimson flame aura wraps the
//    hero and its eyes glow red.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV } from './fx-common.js';
import { V5_FIELD } from '../fireball-v5.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, tailW, tailGlowW, glowTexture, lightSprite } from './light-kit.js';

// per buff: the shell's ramp (linear rim, body, hot, core), how dense its fire is (cut: higher = sparser)
const RAMPS = {
  fire: [[0.85, 0.12, 0.01], [1.0, 0.32, 0.03], [1.0, 0.62, 0.12], [1.0, 0.9, 0.55]],
  blood: [[0.06, 0.0, 0.01], [0.2, 0.005, 0.02], [0.4, 0.02, 0.03], [0.62, 0.08, 0.06]],
  berserk: [[0.35, 0.0, 0.04], [0.85, 0.01, 0.04], [1.0, 0.15, 0.06], [1.0, 0.6, 0.4]],
  wind: [[0.45, 0.7, 0.85], [0.75, 0.9, 0.98], [0.93, 0.99, 1.0], [1, 1, 1]],
  guard: [[0.08, 0.3, 0.9], [0.3, 0.6, 1.0], [0.7, 0.9, 1.0], [1, 1, 1]],
};
const RAMP_OF = { rally: 'fire', war_cry: 'fire', blood_boil: 'blood', berserk: 'berserk', frenzy_roar: 'wind', stand_firm: 'guard' };
/** Buffs whose shout is this module's (the others keep BuffFx's) and whose lasting look is this module's. */
export const AURA_SHOUTS = new Set(['rally', 'war_cry', 'frenzy_roar', 'blood_boil', 'berserk']);
export const AURA_LINGER = new Set(['rally', 'war_cry', 'frenzy_roar', 'stand_firm', 'team_stand', 'provoke', 'blood_boil', 'fighting_spirit', 'berserk']);

const VS = `varying vec3 vObject; varying vec3 vNormal; varying vec3 vEye;
  void main(){ vObject = position; vec4 mv = modelViewMatrix*vec4(position, 1.0);
    vNormal = normalize(normalMatrix*normal); vEye = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
// uMode 0: fire rising up the shell (object y 0..uH), torn into tongues at the top; 1: wind, streaks carried
// round the axis; 2: a skin of light, bright at the silhouette, a shimmer rising through it and a ripple
// from uRip (uRipT seconds old). uCut raises the cut-off (sparser, burning away); uHeat lifts the ramp.
const FS = `uniform float uTime, uAlpha, uMode, uFlow, uCut, uSeed, uFace, uH, uHeat, uRipT;
  uniform vec3 uRip;
  varying vec3 vObject; varying vec3 vNormal; varying vec3 vEye;` + V5_FIELD + `
  vec3 ramp(float h){ vec3 c = mix(uRim, uBody, smoothstep(0.43, 0.57, h)); c = mix(c, uHot, smoothstep(0.57, 0.65, h)); return mix(c, uCore, smoothstep(0.65, 0.75, h)); }
  void main(){
    float t = uTime, h = clamp(vObject.y/uH, 0.0, 1.0);
    float face = abs(dot(normalize(vNormal), normalize(vEye)));
    vec3 a; float thr, heat, alpha;
    if (uMode < 0.5) {
      a = rotateField(vObject*vec3(2.4, 1.0, 2.4), uSeed) - vec3(0.0, uFlow*t, 0.0);
      thr = mix(0.44, 0.66, h*h) + uCut; heat = mix(0.62, 0.48, h) + uHeat;
    } else if (uMode < 1.5) {
      float ang = atan(vObject.z, vObject.x) - t*uFlow;
      a = vec3(cos(ang)*0.9, vObject.y*5.0, sin(ang)*0.9) + vec3(uSeed, 0.0, uSeed*0.7);
      thr = 0.52 + uCut + 0.12*abs(h*2.0 - 1.0); heat = 0.58 + uHeat;
    } else {
      a = vObject*vec3(3.0, 1.6, 3.0) - vec3(0.0, uFlow*t, 0.0) + uSeed;
      thr = 0.0; heat = 0.5 + uHeat;
    }
    float w = 0.34*t + uSeed;
    vec3 warp = vec3(fbm(a*0.95, w, 1.5), fbm(a*0.95 + vec3(19,7,31), w, 1.5), fbm(a*0.95 + vec3(47,23,11), w, 1.5));
    float n = fbm(a + 0.75*(warp - 0.5), 0.46*t + uSeed, 0.65);
    float rip = 0.0;
    if (uRipT < 0.4) { float d = length(vObject - uRip); rip = smoothstep(0.12, 0.0, abs(d - uRipT*3.2))*(1.0 - uRipT/0.4); }
    if (uMode < 1.5) {
      float coverage = clamp((n - thr + 0.012)/0.034, 0.0, 1.0);
      heat += 0.4*(n - thr);
      alpha = coverage*mix(1.0, uFace, smoothstep(0.35, 0.9, face));
    } else {
      float rim = pow(1.0 - face, 2.2);
      float shimmer = smoothstep(0.55, 0.7, n);
      alpha = clamp(rim*0.85 + shimmer*0.18 + rip*0.9, 0.0, 1.0) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.9, 1.0, h));
      heat += 0.25*rim + 0.15*shimmer + 0.4*rip;
    }
    alpha *= uAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(ramp(heat)*1.15, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// Hold the Line: a ring of gold runes on the ground, turning (vP: -1..1 over the plane)
const RUNE_FS = `varying vec2 vP; uniform float uA; uniform float uT;
  void main(){
    float r = length(vP), ang = atan(vP.y, vP.x) + uT*0.6;
    float band = smoothstep(0.66, 0.7, r)*(1.0 - smoothstep(0.92, 0.96, r));
    float edge = smoothstep(0.03, 0.0, abs(r - 0.68)) + smoothstep(0.025, 0.0, abs(r - 0.94)) + smoothstep(0.02, 0.0, abs(r - 0.52))*0.6;
    float cell = fract(ang*12.0/6.2832), id = floor(ang*12.0/6.2832);
    float rune = band*step(0.18, cell)*step(cell, 0.82)*step(0.35, fract(sin(id*12.9898)*43758.5)) * smoothstep(0.02, 0.0, abs(fract(r*9.0 + id*0.37) - 0.5) - 0.18);
    float a = clamp(edge + rune*0.9, 0.0, 1.0);
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(vec3(1.0, 0.62, 0.12), vec3(1.0, 0.95, 0.7), clamp(edge, 0.0, 1.0)), a*uA); }`;
const DECAL_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;

const FLAMES = 8, WINDS = 6, SKINS = 4, RUNES = 4, TETHERS = 6, MOTES = 18, TETHER_PTS = 9, MOTE_PTS = 6, MOTE_LIFE = 0.5;
const out2 = (k) => 1 - (1 - k) * (1 - k);
const UP = new THREE.Vector3(0, 1, 0);

/** A body aura: an open lathe round a standing body, y 0..1.9. */
function auraGeometry() {
  const prof = [[0.34, 0.0], [0.42, 0.25], [0.44, 0.8], [0.4, 1.3], [0.3, 1.7], [0.16, 1.92]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24); g.userData.shared = true; return g;
}

export class AuraFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(97); this.t = 0;
    this.core = new Ribbon(scene, camera, 1500, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1500, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const mat = (mode) => new THREE.ShaderMaterial({
      uniforms: { uRim: { value: new THREE.Color() }, uBody: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uCore: { value: new THREE.Color() },
        uTime: { value: 0 }, uAlpha: { value: 0 }, uMode: { value: mode }, uFlow: { value: 1 }, uCut: { value: 0 }, uSeed: { value: 0 }, uFace: { value: 0.4 }, uH: { value: 1.9 }, uHeat: { value: 0 }, uRipT: { value: 9 }, uRip: { value: new THREE.Vector3() } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    });
    const body = auraGeometry();
    const wind = new THREE.CylinderGeometry(1, 1, 1, 32, 2, true); wind.translate(0, 0.5, 0); wind.userData.shared = true;
    const skin = new THREE.SphereGeometry(1, 24, 16); skin.translate(0, 1, 0); skin.userData.shared = true;
    const pool = (n, geo, mode, order) => Array.from({ length: n }, (_, i) => { const m = new THREE.Mesh(geo, mat(mode)); m.material.uniforms.uSeed.value = i * 3.7; m.visible = false; m.frustumCulled = false; m.renderOrder = order; scene.add(m); return m; });
    this.flames = pool(FLAMES, body, 0, 6);
    this.winds = pool(WINDS, wind, 1, 6);
    this.skins = pool(SKINS, skin, 2, 6);
    const plane = new THREE.PlaneGeometry(1, 1); plane.userData.shared = true;
    this.runes = Array.from({ length: RUNES }, () => { const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uT: { value: 0 } }, vertexShader: DECAL_VS, fragmentShader: RUNE_FS, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; scene.add(m); return m; });
    this.eyes = [0, 1].map(() => { const sp = lightSprite(scene, glowTexture('fire'), true, 12); sp.material.color.setRGB(1, 0.15, 0.1); return sp; });
    // the casts' bursts: [{kind, x, z, t, life, body}] drawn with the flame/wind pools
    this.bursts = Array.from({ length: 8 }, () => ({ kind: null, x: 0, z: 0, t: 9, life: 0.8, r: 1 }));
    this.motes = Array.from({ length: MOTES }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), body: null, t: 9, pts: Array.from({ length: MOTE_PTS }, () => new THREE.Vector3()) }));
    this.moteI = 0;
    this.tether = Array.from({ length: TETHER_PTS }, () => new THREE.Vector3());
    this.ripT = 9; this.ripAt = new THREE.Vector3(); this.onShake = null;
    this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.w = new THREE.Vector3(); this.side = new THREE.Vector3();
  }
  ramp(m, kind) {
    const R = RAMPS[RAMP_OF[kind] || 'fire'], U = m.material.uniforms;
    U.uRim.value.setRGB(...R[0]); U.uBody.value.setRGB(...R[1]); U.uHot.value.setRGB(...R[2]); U.uCore.value.setRGB(...R[3]);
  }
  // the cast (the rules' 'buff'): bodies [{x, z}] the buff reached; radius its true reach
  shout(kind, x, z, radius, bodies) {
    if (kind === 'frenzy_roar') this.burst(kind, x, z, Math.max(1.5, radius || 1.5), 0.75);
    else for (const b of bodies) this.burst(kind, b.x, b.z, kind === 'berserk' ? 1.6 : 1.25, kind === 'berserk' ? 0.9 : 0.75);
    if (kind === 'berserk') this.onShake?.(0.22, 0.4); else if (kind === 'blood_boil') this.onShake?.(0.06, 0.15); else this.onShake?.(0.08, 0.15);
  }
  burst(kind, x, z, size, life) {
    const b = this.bursts.find((q) => q.t >= q.life) || this.bursts[0];
    b.kind = kind; b.x = x; b.z = z; b.r = size; b.t = 0; b.life = life;
  }
  // Fighting Spirit: a mote of life from the struck monster back to the one who hit it
  mote(from, body) {
    const m = this.motes[this.moteI++ % MOTES];
    m.from.copy(from); m.body = body; m.t = 0;
  }
  // Stand Firm: a blow on the hero ripples its skin of light where it came from
  ripple(p, fromX, fromZ) {
    const a = Math.atan2(fromX - p.x, fromZ - p.z);
    this.ripT = 0; this.ripAt.set(Math.sin(a) * 0.55, 0.9, Math.cos(a) * 0.55);
  }
  /**
   * Every frame. bodies: [{x, z, facing, hp, maxHp, buffs}] (the hero first), monsters: the game's, rage: the
   * hero's Boiling Blood strength 0..1, blade: [base, tip] of the hero's weapon (ground-relative) or null,
   * head: the hero's head (ground-relative) or null.
   */
  update(dt, bodies, monsters, hero, rage, blade, head) {
    this.t += dt; this.ripT += dt;
    this.core.begin(); this.glow.begin();
    let fi = 0, wi = 0, si = 0, ri = 0;
    const flame = (kind) => { const m = this.flames[fi++]; if (m) this.ramp(m, kind); return m; };
    const t = this.t;
    // the casts' bursts
    for (const b of this.bursts) {
      if (b.t >= b.life) continue;
      b.t += dt;
      const k = Math.min(1, b.t / b.life);
      if (b.kind === 'frenzy_roar') {
        // a ring of wind sweeping out through everyone to the true radius
        const m = this.winds[wi++]; if (!m) continue;
        this.ramp(m, 'frenzy_roar');
        m.visible = true; place(m, b.x, 0.15, b.z); const rr = 0.6 + (b.r - 0.6) * out2(k); m.scale.set(rr, 1.3 * (1 - 0.4 * k), rr);
        const U = m.material.uniforms; U.uTime.value = t; U.uFlow.value = 5; U.uAlpha.value = (1 - k * k) * Math.min(1, k * 8); U.uCut.value = 0.04 + 0.2 * k; U.uFace.value = 0.6; U.uH.value = 1;
      } else {
        // fire / steam / a crimson aura bursting up off the body, burning away
        const m = flame(b.kind); if (!m) continue;
        m.visible = true; place(m, b.x, 0, b.z); m.rotation.set(0, 0, 0); const wide = b.kind === 'blood_boil' ? 1.5 : 1, s = b.r * wide * (0.75 + 0.4 * out2(k)); m.scale.set(s, b.r * (0.9 + 0.5 * out2(k)) / wide, s);
        const U = m.material.uniforms; U.uTime.value = t; U.uFlow.value = b.kind === 'blood_boil' ? 1.4 : 2.6; U.uAlpha.value = Math.min(1, k * 10); U.uCut.value = (b.kind === 'blood_boil' ? 0.06 : -0.06) + 0.42 * k * k; U.uHeat.value = b.kind === 'blood_boil' ? 0.02 : -0.06 * k; U.uFace.value = 0.45; U.uH.value = 1.9;
      }
    }
    // what lasts, per body
    for (let bi = 0; bi < bodies.length; bi++) {
      const B = bodies[bi], buffs = B.buffs || {}, isHero = bi === 0;
      // Rally / War Cry: the hero's weapon burns; an ally's shoulders smoulder
      for (const k of ['rally', 'war_cry']) {
        if (!buffs[k]) continue;
        const m = flame(k); if (!m) break;
        const U = m.material.uniforms; m.visible = true;
        U.uTime.value = t; U.uFlow.value = 3; U.uAlpha.value = Math.min(1, buffs[k].t * 2); U.uFace.value = 0.5;
        if (isHero && blade) {
          this.v.subVectors(blade[1], blade[0]); const len = this.v.length(); this.v.normalize();
          placeV(m, blade[0]); m.quaternion.setFromUnitVectors(UP, this.v); m.scale.set(0.42, len / 1.9 * 1.25, 0.42);
          U.uCut.value = -0.04; U.uHeat.value = 0.02; U.uH.value = 1.9;
        } else { m.rotation.set(0, 0, 0); place(m, B.x, 0.75, B.z); m.scale.set(1.05, 0.55, 1.05); U.uCut.value = 0.12; U.uHeat.value = 0; U.uH.value = 1.9; }
        break;
      }
      // Frenzy Roar: a whirl of wind round the legs
      if (buffs.frenzy_roar) {
        const m = this.winds[wi++];
        if (m) {
          this.ramp(m, 'frenzy_roar'); m.visible = true; place(m, B.x, 0.05, B.z); m.scale.set(0.62, 0.75, 0.62);
          const U = m.material.uniforms; U.uTime.value = t; U.uFlow.value = 7; U.uAlpha.value = Math.min(1, buffs.frenzy_roar.t * 2) * 0.9; U.uCut.value = 0.02; U.uFace.value = 0.7; U.uH.value = 1;
        }
      }
      // Stand Firm: a thin skin of light, rippling where a blow lands (the hero's)
      if (buffs.stand_firm) {
        const m = this.skins[si++];
        if (m) {
          this.ramp(m, 'stand_firm'); m.visible = true; place(m, B.x, 0.0, B.z); m.scale.set(0.62, 0.95, 0.62);
          const U = m.material.uniforms; U.uTime.value = t; U.uFlow.value = 0.8; U.uAlpha.value = Math.min(1, buffs.stand_firm.t * 2); U.uH.value = 1.9;
          U.uRipT.value = isHero ? this.ripT : 9; U.uRip.value.copy(this.ripAt);
        }
      }
      // Hold the Line: a ring of gold runes turning underfoot
      if (buffs.team_stand) {
        const m = this.runes[ri++];
        if (m) { m.visible = true; place(m, B.x, 0.04, B.z); m.scale.setScalar(2.2); m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = Math.min(1, buffs.team_stand.t * 2) * (0.85 + 0.15 * Math.sin(t * 4)); }
      }
      // Boiling Blood: steam rising off the body, thicker and hotter as HP falls
      if (buffs.blood_boil) {
        const m = flame('blood_boil');
        if (m) {
          const k = isHero ? rage : 0.3; m.visible = true; m.rotation.set(0, 0, 0); place(m, B.x, 0, B.z); m.scale.set(0.95 + 0.15 * k, 0.85 + 0.25 * k, 0.95 + 0.15 * k);
          const U = m.material.uniforms; U.uTime.value = t; U.uFlow.value = 0.7 + 0.9 * k; U.uAlpha.value = Math.min(1, buffs.blood_boil.t * 2) * (0.6 + 0.4 * k); U.uCut.value = 0.16 - 0.22 * k; U.uHeat.value = 0.05 * k; U.uFace.value = 0.7; U.uH.value = 1.9;
        }
      }
      // Berserk: a dense crimson flame aura, and (the hero) red eyes
      if (buffs.berserk) {
        const m = flame('berserk');
        if (m) {
          m.visible = true; m.rotation.set(0, 0, 0); place(m, B.x, 0, B.z); m.scale.set(1.1, 1.08, 1.1);
          const U = m.material.uniforms; U.uTime.value = t; U.uFlow.value = 2.8; U.uAlpha.value = Math.min(1, buffs.berserk.t * 2); U.uCut.value = -0.04; U.uHeat.value = 0.02; U.uFace.value = 0.3; U.uH.value = 1.9;
        }
      }
    }
    for (; fi < FLAMES; fi++) this.flames[fi].visible = false;
    for (; wi < WINDS; wi++) this.winds[wi].visible = false;
    for (; si < SKINS; si++) this.skins[si].visible = false;
    for (; ri < RUNES; ri++) this.runes[ri].visible = false;
    // the hero's eyes under Berserk
    const eyes = !!(hero?.buffs?.berserk && head && !hero.dead);
    for (const [i, sp] of this.eyes.entries()) {
      sp.visible = eyes; if (!eyes) continue;
      const f = hero.facing, sx = Math.cos(f), sz = -Math.sin(f), s = i ? 1 : -1;
      sp.position.set(head.x + Math.sin(f) * 0.24 + sx * 0.09 * s, head.y + 0.02, head.z + Math.cos(f) * 0.24 + sz * 0.09 * s); placeV(sp, sp.position);
      sp.scale.setScalar(0.22 + 0.05 * Math.sin(t * 9 + i)); sp.material.opacity = 0.95;
    }
    // Provoke: red tethers from each provoked monster to the hero
    if (hero && !hero.dead) {
      let n = 0;
      for (const m of monsters) {
        if (n >= TETHERS || m.dead || !(m.tauntT > 0) || m.forcedTargetId !== hero.id) continue;
        n++;
        const fade = Math.min(1, m.tauntT * 2) * (0.7 + 0.3 * Math.sin(t * 10 + m.x));
        for (let i = 0; i < TETHER_PTS; i++) {
          const u = i / (TETHER_PTS - 1), sag = Math.sin(Math.PI * u) * 0.35, wob = Math.sin(u * 9 - t * 12) * 0.06 * Math.sin(Math.PI * u);
          this.tether[i].set(m.x + (hero.x - m.x) * u, 1.1 + (1.0 - 1.1) * u - sag * 0.4 + wob, m.z + (hero.z - m.z) * u);
        }
        W.v = 0.11; this.glow.strip(this.tether, lineGlowW, 0.6 * fade, [1.0, 0.1, 0.04]); this.core.strip(this.tether, lineW, 0.85 * fade, [1.0, 0.45, 0.3]);
      }
    }
    // Fighting Spirit: motes of life arcing back into the one who hit
    for (const q of this.motes) {
      if (q.t >= MOTE_LIFE) continue;
      q.t += dt;
      const k = Math.min(1, q.t / MOTE_LIFE);
      if (q.body) q.to.set(q.body.x, 1.0, q.body.z);
      for (let i = 0; i < MOTE_PTS; i++) {
        const u = Math.max(0, k - (i / (MOTE_PTS - 1)) * 0.3), e = u * u * (3 - 2 * u);
        q.pts[MOTE_PTS - 1 - i].lerpVectors(q.from, q.to, e); q.pts[MOTE_PTS - 1 - i].y += Math.sin(Math.PI * e) * 1.1;
      }
      const a = Math.min(1, k * 6) * (1 - k * k * k);
      W.v = 0.2; this.glow.strip(q.pts, tailGlowW, 0.9 * a, [0.3, 0.9, 0.2]); this.core.strip(q.pts, tailW, a, [0.85, 1.0, 0.55]);
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const m of [...this.flames, ...this.winds, ...this.skins, ...this.runes]) m.visible = false;
    for (const b of this.bursts) b.t = b.life = 9;
    for (const q of this.motes) q.t = 9;
    for (const sp of this.eyes) sp.visible = false;
  }
}
