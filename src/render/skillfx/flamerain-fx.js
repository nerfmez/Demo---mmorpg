// Flame Arrow Rain (the spell archer's fire skill, 2026-10-31, round 2). Owner: round 1 (a rain from a
// burst in the sky) looked too much like Arrow Rain; now every arrow is its own bomb. The hero looses a
// fan of eight fire arrows that fly high arcs from the bow (a dark shaft with red fletching and a hot
// point, wrapped in a comet of Firebolt's fire: meteor-flame.js, V5_FIELD) and pin into the ground across
// the circle together. Each pinned arrow then burns down its own fuse - its flame tongue swelling and
// flickering faster, a ring of embers under it closing in on the arrow to show its blast and how soon -
// and bursts on its own time (the rules' 'burst' at its spot): a flash, a small dome of Firebolt's fire that
// bursts up and tears into tongues as it burns away (Meteor's dome, meteor-flame.js, at an arrow's size),
// embers, a thin ring of fire out to its blast radius, and a small round pit in the game's toon steps
// whose molten floor cools (ground-kit.js craterMesh, Meteor's crater shader). Nothing falls from the sky (that is Arrow Rain and
// Meteor). Cosmetic only; driven by the rules' arrowPin and burst events.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, placeV, conformPlane } from './fx-common.js';
import { flameMaterial, cometShell, domeShell } from './meteor-flame.js';
import { craterMesh } from './ground-kit.js';

const ARROWS = 24, BURSTS = 10, FLASHES = 8;
const DOME_T = 0.75, PIT_T = 1.8;             // the fire dome burns away in DOME_T s, the little pit fades by PIT_T
const SHAFT = 0.95;                           // shaft length (once pinned, 0.58 of it stands out of the ground)
const SHAFT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.95) discard; vec3 c = vT*(1.0 - 0.35*d*d); gl_FragColor=vec4(c, vA); }`;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,0.97,0.82), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the fuse ring under a pinned arrow: the blast's edge as a faint line, and a ring of embers that closes in
// from it onto the arrow as the fuse burns (uFuse 0..1); uBlast 0..1: the burst's ring of fire racing out
const FUSE_FS = `varying vec2 vP; uniform float uFuse; uniform float uBlast; uniform float uTime;
  void main(){
    float r = length(vP); if (r > 1.0) discard;
    float a = 0.0; vec3 c = vec3(1.0, 0.45, 0.12);
    if (uBlast <= 0.0) {
      a += smoothstep(0.03, 0.0, abs(r - 0.97)) * (0.12 + 0.25*uFuse);   // the blast's edge, firmer as it nears
      float k = 1.0 - uFuse, w = 0.05 + 0.04*uFuse;                       // the closing ember ring
      float flick = 0.75 + 0.25*sin(atan(vP.y, vP.x)*9.0 + uTime*14.0);
      a += smoothstep(w, 0.0, abs(r - k)) * flick * (0.3 + 0.7*uFuse);
      a += (1.0 - r) * 0.08 * uFuse;                                       // a warm floor as it nears
      c = mix(c, vec3(1.0, 0.85, 0.45), smoothstep(0.6, 1.0, uFuse));
    } else {
      float front = uBlast, w = 0.12 + 0.1*uBlast;                         // a ring of fire racing out
      a = smoothstep(w, 0.0, abs(r - front)) * (1.0 - uBlast) * 1.2 + (1.0 - smoothstep(0.0, front, r)) * 0.25 * (1.0 - uBlast);
      c = mix(vec3(1.0, 0.9, 0.55), vec3(1.0, 0.4, 0.1), uBlast);
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, min(1.0, a)); }`;
const UPV = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0);
let sw = 0;
const shaftW = () => sw, glowW = (x) => sw * (0.8 + 2.6 * x * x), coreW = (x) => sw * (0.3 + 0.7 * x * x * x), tipW = (x) => sw * Math.sin(Math.PI * x);
const BLAST_T = 0.32;                         // the burst's ring of fire runs out this long

export class FlameRainFx {
  /** fire: the director's FireExtras (embers and a fire pop at each burst) */
  constructor(scene, camera, fire) {
    this.camera = camera; this.fire = fire;
    this.shaft = new Ribbon(scene, camera, 1200, SHAFT_FS, THREE.NormalBlending);
    this.core = new Ribbon(scene, camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.shaft.mesh.renderOrder = 5; this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const comet = cometShell(0, 1, 4), disc = new THREE.PlaneGeometry(1, 1);
    const fuseVS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
    // one pooled record per arrow: its flame (the comet in flight, the tongue once pinned) and its fuse ring
    this.arrows = Array.from({ length: ARROWS }, (_, k) => {
      const mat = flameMaterial(0, 0); mat.uniforms.uSeed.value = k * 1.37;
      const flame = new THREE.Mesh(comet, mat); flame.visible = false; flame.renderOrder = 6; flame.frustumCulled = false; scene.add(flame);
      const fmat = new THREE.ShaderMaterial({ uniforms: { uFuse: { value: 0 }, uBlast: { value: 0 }, uTime: { value: 0 } }, vertexShader: fuseVS, fragmentShader: FUSE_FS, transparent: true, depthWrite: false });
      const ring = new THREE.Mesh(disc, fmat); ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 2; scene.add(ring);
      return { live: false, id: 0, flame, mat, ring, fmat, t: 0, land: 0, delay: 0, fx: 0, fz: 0, x: 0, z: 0, apex: 0, burst: -1, blast: 1.4, seed: 0, dir: new THREE.Vector3() };
    });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.flashes = Array.from({ length: FLASHES }, (_, k) => {
      const m = new THREE.Mesh(quad, flashMaterial(5 + k * 3.1)); tintFlash(m.material, 'fire');
      m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m);
      return { m, t: 9, size: 1 };
    });
    this.flashI = 0;
    const shell = (mode, layer, filled, order, k) => { const m = new THREE.Mesh(domeShell(), flameMaterial(mode, layer, filled)); m.renderOrder = order; m.frustumCulled = false; m.material.uniforms.uSeed.value = k * 2.3 + layer; return m; };
    this.bursts = Array.from({ length: BURSTS }, (_, k) => {
      const dome = new THREE.Group();
      dome.add(shell(1, 0, false, 7, k), shell(1, 1, false, 6, k));
      const core = shell(1, 1, true, 5, k); core.scale.setScalar(0.62); dome.add(core);
      dome.visible = false; scene.add(dome);
      return { dome, pit: craterMesh(scene, 3 + k * 4.1), live: false, t: 0, x: 0, z: 0, size: 1 };
    });
    this.burstI = 0;
    this.rnd = mulberry32(57); this.t = 0;
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.p = new THREE.Vector3(); this.q = new THREE.Vector3(); this.side = new THREE.Vector3(); this.tail = new THREE.Vector3();
  }
  flash(v, size) { const f = this.flashes[this.flashI++ % FLASHES]; f.t = 0; f.size = size; placeV(f.m, v); }
  // the rules' 'arrowPin': one arrow of the volley, from the hero (fromX, fromZ) to (x, z); it lands at
  // `land` s and bursts at `delay` s from now; blast: the burst's radius
  pin(e, blast) {
    const a = this.arrows.find((q) => !q.live) || this.arrows[0], r = this.rnd;
    const d = Math.hypot(e.x - e.fromX, e.z - e.fromZ);
    Object.assign(a, { live: true, id: e.id, t: 0, land: e.land * (0.92 + 0.08 * r()), delay: e.delay, fx: e.fromX, fz: e.fromZ, x: e.x, z: e.z,
      apex: 1.6 + d * 0.16 + r() * 0.5, burst: -1, blast, seed: r() * 10 });
    a.flame.visible = false; a.ring.visible = false;
    a.ring.scale.setScalar(blast * 2); placeV(a.ring, this.p.set(e.x, 0.04, e.z)); conformPlane(a.ring);
  }
  // the rules' 'burst' of one arrow's area
  burst(e) {
    const a = this.arrows.find((q) => q.live && q.id === e.id) || this.arrows.find((q) => q.live && q.burst < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!a) return;
    a.burst = a.t;
    this.p.set(a.x, 0.45, a.z); this.flash(this.p, 2.0);
    this.fire?.impact(a.x, 0.4, a.z, true, 0.8);   // embers only: the dome is the fire
    const b = this.bursts[this.burstI++ % BURSTS];
    Object.assign(b, { live: true, t: 0, x: a.x, z: a.z, size: a.blast * 0.62 });
    b.dome.visible = true; placeV(b.dome, this.p.set(a.x, 0, a.z)); b.dome.scale.setScalar(0.01);
    const lip = a.blast * 0.32; b.pit.visible = true; placeV(b.pit, this.p.set(a.x, 0.05, a.z)); b.pit.scale.setScalar(lip * 1.7 * 2); conformPlane(b.pit);
    a.flame.visible = false;
  }
  // red fletching: two short vanes splayed back from the shaft's end (tail: the end, dir: the flight)
  fletch(tail, dir, alpha) {
    const two = this.two, s = this.side.set(-dir.z, 0, dir.x);
    if (s.lengthSq() < 1e-6) s.set(1, 0, 0); s.normalize();
    for (const sg of [1, -1]) {
      two[0].copy(tail).addScaledVector(dir, 0.22); two[1].copy(tail).addScaledVector(dir, -0.04).addScaledVector(s, 0.09 * sg).addScaledVector(UPV, 0.05);
      sw = 0.05; this.shaft.strip(two, shaftW, alpha, [0.85, 0.22, 0.1]);
    }
  }
  // a point on an arrow's arc at u (0 bow .. 1 ground) into out; its flight direction into dir
  arc(a, u, out, dir) {
    const h = 1.5 * (1 - u) + 4 * a.apex * u * (1 - u);
    out.set(a.fx + (a.x - a.fx) * u, h, a.fz + (a.z - a.fz) * u);
    const dh = -1.5 + 4 * a.apex * (1 - 2 * u);
    dir.set(a.x - a.fx, dh, a.z - a.fz).normalize();
    return out;
  }
  update(dt) {
    this.t += dt;
    this.shaft.begin(); this.core.begin(); this.glow.begin();
    const two = this.two, three = this.three, dir = this.dir;
    for (const f of this.flashes) {
      f.t += dt; const k = f.t / 0.24;
      f.m.visible = k < 1;
      if (!f.m.visible) continue;
      f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(f.size * (0.6 + k * 0.7)); f.m.material.uniforms.uT.value = k;
    }
    for (const a of this.arrows) {
      if (!a.live) continue;
      a.t += dt;
      a.fmat.uniforms.uTime.value = this.t;
      if (a.burst >= 0) {
        // the burst: a ring of fire out to the blast radius, then the arrow is gone
        const k = (a.t - a.burst) / BLAST_T;
        if (k >= 1) { a.live = false; a.ring.visible = false; continue; }
        a.ring.visible = true; a.fmat.uniforms.uBlast.value = Math.max(0.001, k);
        continue;
      }
      if (a.t < a.land) {
        // in flight: a high arc from the bow, the shaft trailing the head, the comet of fire round it
        const u = a.t / a.land;
        this.arc(a, u, this.p, dir);
        two[0].copy(this.p).addScaledVector(dir, -SHAFT); two[1].copy(this.p);
        sw = 0.055; this.shaft.strip(two, shaftW, 1, [0.32, 0.16, 0.08]);
        this.tail.copy(two[0]); this.fletch(this.tail, dir, 1);
        three[0].copy(this.p).addScaledVector(dir, -1.6 * Math.min(1, u * 4)); three[1].copy(this.p).addScaledVector(dir, -0.5); three[2].copy(this.p);
        sw = 0.09; this.glow.strip(three, glowW, 0.8, [1.0, 0.42, 0.1]);
        sw = 0.035; this.core.strip(three, coreW, 0.9, [1.0, 0.6, 0.2]);
        two[0].copy(this.p).addScaledVector(dir, -0.16); two[1].copy(this.p).addScaledVector(dir, 0.06);
        sw = 0.09; this.core.strip(two, tipW, 1, [1.0, 0.9, 0.55]);
        const m = a.flame; m.visible = true; placeV(m, this.p);
        m.quaternion.setFromUnitVectors(X, dir); m.scale.set(1.5 / 4, 0.16, 0.16);
        a.mat.uniforms.uTime.value = this.t; a.mat.uniforms.uAlpha.value = Math.min(1, u * 5); a.mat.uniforms.uCut.value = 0; a.mat.uniforms.uCool.value = 0;
        a.dir.copy(dir);
        continue;
      }
      if (!a.landedFx) { a.landedFx = true; this.fire?.burst(a.x, 0.1, a.z, 3, 0.4); }
      // pinned, its fuse burning: the shaft at the slant it flew in, a tongue of flame that swells and
      // flickers faster toward the burst, the ember ring closing onto it
      const fuse = Math.min(1, (a.t - a.land) / Math.max(0.05, a.delay - a.land));
      dir.copy(a.dir);
      two[0].set(a.x, 0.02, a.z); two[1].set(a.x - dir.x * SHAFT * 0.58, -dir.y * SHAFT * 0.58, a.z - dir.z * SHAFT * 0.58);
      sw = 0.05; this.shaft.strip(two, shaftW, 1, [0.3 - 0.15 * fuse, 0.15 - 0.08 * fuse, 0.08 - 0.04 * fuse]);
      this.tail.copy(two[1]); this.fletch(this.tail, dir, 1 - fuse * 0.5);
      const rate = 12 + 26 * fuse, flicker = 1 + (0.1 + 0.12 * fuse) * Math.sin(this.t * rate + a.seed * 5) + 0.07 * Math.sin(this.t * rate * 1.7 + a.seed);
      const grow = Math.min(1, (a.t - a.land) / 0.1) * (0.75 + 0.6 * fuse * fuse);
      const m = a.flame; m.visible = true; placeV(m, this.p.set(a.x, 0.05, a.z));
      m.quaternion.setFromUnitVectors(X, DOWN); m.scale.set(0.26 * grow * flicker, 0.15 * grow, 0.15 * grow);
      a.mat.uniforms.uTime.value = this.t; a.mat.uniforms.uAlpha.value = 1; a.mat.uniforms.uCut.value = 0; a.mat.uniforms.uCool.value = -0.1 * fuse;
      a.ring.visible = true; a.fmat.uniforms.uFuse.value = fuse; a.fmat.uniforms.uBlast.value = 0;
      // a hot glint at the arrow's foot, brightest just before it goes
      two[0].set(a.x, 0.05, a.z); two[1].set(a.x, 0.25 + 0.25 * fuse, a.z);
      sw = 0.18 + 0.2 * fuse; this.glow.strip(two, glowW, 0.35 + 0.5 * fuse, [1.0, 0.45, 0.1]);
    }
    for (const b of this.bursts) {
      if (!b.live) continue;
      b.t += dt; const t = b.t;
      // the dome bursts up out of the ground in a few frames, then tears into tongues and burns away
      const grow = 1 - Math.pow(1 - Math.min(1, t / 0.12), 3), size = b.size * (0.35 + 0.65 * grow) * (1 + 0.15 * Math.min(1, t / DOME_T));
      const cut = Math.max(0, t - 0.14) / (DOME_T - 0.2), fade = Math.max(0, Math.min(1, (DOME_T - t) / 0.18));
      b.dome.visible = fade > 0; b.dome.scale.set(size, size * 1.35, size);
      for (const m of b.dome.children) { const u = m.material.uniforms; u.uTime.value = this.t; u.uCut.value = 0.07 + 0.45 * cut * cut; u.uCool.value = 0.07 + 0.2 * Math.min(1, cut); u.uAlpha.value = fade; }
      b.dome.children[2].material.uniforms.uAlpha.value = Math.max(0, 1 - t / 0.25);
      // the pit: its molten floor cools, then it fades away
      const C = b.pit.material.uniforms; C.uGlow.value = Math.max(0, 1 - t / 1.1); C.uA.value = Math.min(1, t / 0.05) * Math.max(0, Math.min(1, (PIT_T - t) / 0.7));
      if (t > PIT_T) { b.live = false; b.dome.visible = false; b.pit.visible = false; }
    }
    this.shaft.end(); this.core.end(); this.glow.end();
  }
  clear() {
    for (const a of this.arrows) { a.live = false; a.flame.visible = false; a.ring.visible = false; a.landedFx = false; }
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    for (const b of this.bursts) { b.live = false; b.dome.visible = false; b.pit.visible = false; }
  }
  get busy() { return this.arrows.some((a) => a.live) || this.bursts.some((b) => b.live); }
}
