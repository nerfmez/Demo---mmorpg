// Miasma Arrow (the spell archer's poison skill, 2026-10-31, round 2). Owner: round 1 (a flat violet pool and
// solid cel puffs) was disliked; this round follows the pixelfx quality bar the owner pointed to
// (github.com/patch-gg/pixelfx docs/AUTHORING.md and its "Poison cloud", MIT; studied for its rules, nothing
// copied): lines and light, not fills; translucent volumes lit from within and low down; light everywhere;
// varied small events; a hard step ramp from deep violet through olive and lime to pale yellow.
//   A poisoned arrow arcs from the bow and pins at the centre with a white-green flash. A miasma hugs the
//   floor over the true radius: soft see-through puffs of gas rolling out from the arrow (no outline), lit
//   lime low down and darkening to violet higher up, swelling and thinning. The arrow
//   stands nearly upright with a soft glow round its foot and thin vapour curling up off it, bubbles
//   doming and popping, and pumps on every beat (the rules' half-second ticks): a thin ring of light runs
//   out over the floor and the glow under the gas swells. Plumes lift off the gas and twist up as thin
//   ribbons; specks drift out through it, twinkling; soft pockets of light wander inside it. At the end the
//   gas sinks and thins, the glow fades. Cosmetic only: the rules' 'area'/'areaEnd'.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV, conformPlane, fxGround, NOISE } from './fx-common.js';
import { glowTexture, lightSprite } from './light-kit.js';

const ZONES = 3, FLIGHT = 0.24, SHAFT = 0.95, BEAT = 0.5, POCKETS = 4, PLUMES = 7, SPECKS = 40, PUFFS = 72, PUFF_LIFE = 2.2;
// the ramp, dark to bright (hard steps between them)
const VIOLET = [0.24, 0.13, 0.34], OLIVE = [0.42, 0.42, 0.23], LIME = [0.59, 0.67, 0.19], BRIGHT = [0.8, 0.88, 0.25], PALE = [0.96, 1.0, 0.63];
const SHAFT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.95) discard; vec3 c = vT*(1.0 - 0.35*d*d); gl_FragColor=vec4(c, vA); }`;
const SOFT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=(1.0 - d*d)*vA; if (a < 0.01) discard; gl_FragColor=vec4(vT, a); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the gas: soft translucent puffs (camera-facing quads cut from noise, no outline), lit lime low down and
// darkening to violet higher up (pixelfx: smoke is translucent, lit, swelling and thinning, never a solid
// blob); aLife (age 0..1, seed), the world height of the puff's centre in aH
const PUFF_VS = `attribute vec2 aLife; attribute float aH; varying vec2 vUv; varying vec2 vLife; varying float vH;
  void main(){ vUv = uv*2.0 - 1.0; vLife = aLife;
    vec4 c = viewMatrix*modelMatrix*instanceMatrix*vec4(0.0, 0.0, 0.0, 1.0);
    float s = length(instanceMatrix[0].xyz);
    float s0 = length(instanceMatrix[0].xyz);
    vec4 centre = projectionMatrix*(c + vec4(0.0, 0.0, 2.2*s0, 0.0)); // a depth nearer the camera than the ground under its lower half
    c.xy += position.xy*s; vH = aH + position.y*s*0.6;
    gl_Position = projectionMatrix*c;
    // the whole quad at its centre's depth: the ground never cuts its lower half off in a straight line
    gl_Position.z = centre.z/centre.w*gl_Position.w; }`;
const PUFF_FS = `varying vec2 vUv; varying vec2 vLife; varying float vH; uniform vec3 uViolet; uniform vec3 uOlive; uniform vec3 uLime; uniform vec3 uBright;` + NOISE + `
  void main(){
    float age = vLife.x; if (age < 0.0 || age > 1.0) discard;
    float r = length(vUv);
    float n = fbm(vUv*1.5 + vLife.y*9.0 + vec2(age*0.5, -age*0.8));
    float d = n*1.35 - r*1.25;                                         // density: soft, torn at the edge
    float fade = smoothstep(0.0, 0.12, age)*(1.0 - smoothstep(0.55, 1.0, age));
    float al = smoothstep(0.0, 0.25, d)*(1.0 - smoothstep(0.7, 1.0, r))*0.5*fade;   // round, never the quad's corners
    if (al < 0.01) discard;
    // low: lit lime; only the high wisps go violet. Smoke is soft (pixelfx: softness belongs to light and
    // translucent smoke), and the band moves with the puff's own noise, so no straight lines run across
    float k = clamp(vH/2.4 + (n - 0.5)*0.35 - vUv.y*0.12, 0.0, 1.0);
    vec3 c = mix(uBright, uLime, smoothstep(0.15, 0.45, k));
    c = mix(c, uOlive, smoothstep(0.5, 0.8, k)); c = mix(c, uViolet, smoothstep(0.78, 1.0, k));
    c = mix(c, vec3(0.86, 0.95, 0.8), 0.18); // a little paler: gas, not paint
    c = mix(c, uBright, smoothstep(0.35, 0.7, d)*0.25*(1.0 - k));     // a little light inside its thick part
    gl_FragColor = vec4(c, al); }`;
// the floor under it: a soft glow lit from within that swells on the beat, and a thin ring running out
const FLOOR_FS = `varying vec2 vP; uniform float uA; uniform float uBeat; uniform float uRing; uniform vec3 uLime; uniform vec3 uPale;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float glow = (1.0 - smoothstep(0.2, 1.0, r))*(0.16 + 0.12*uBeat);
    float ring = uRing > 0.0 ? (1.0 - smoothstep(0.0, 0.025, abs(r - uRing)))*(1.0 - uRing)*0.9 : 0.0;
    float edge = (1.0 - smoothstep(0.0, 0.02, abs(r - 0.97)))*0.35;
    vec3 c = uLime*glow + uPale*(ring + edge);
    gl_FragColor = vec4(c*uA, 1.0); }`;
let sw = 0;
const shaftW = () => sw, glowW = (x) => sw * (0.6 + 2.4 * x * x), plumeW = (x) => sw * Math.sin(Math.PI * Math.min(1, x * 1.15)), dotW = (x) => sw * Math.sin(Math.PI * x);

export class MiasmaFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.shaft = new Ribbon(scene, camera, 300, SHAFT_FS, THREE.NormalBlending);
    this.soft = new Ribbon(scene, camera, 1400, SOFT_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.shaft.mesh.renderOrder = 6; this.soft.mesh.renderOrder = 7; this.glow.mesh.renderOrder = 8;
        const col = (c) => ({ value: new THREE.Color(c[0], c[1], c[2]) });
    const ramp = { uViolet: col(VIOLET), uOlive: col(OLIVE), uLime: col(LIME), uBright: col(BRIGHT), uPale: col(PALE) };
    const decalVS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.life = new Float32Array(PUFFS * 2).fill(-1); this.hgt = new Float32Array(PUFFS);
    quad.setAttribute('aLife', new THREE.InstancedBufferAttribute(this.life, 2)); quad.setAttribute('aH', new THREE.InstancedBufferAttribute(this.hgt, 1));
    this.puffMesh = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({ uniforms: { uViolet: ramp.uViolet, uOlive: ramp.uOlive, uLime: ramp.uLime, uBright: ramp.uBright },
      vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false }), PUFFS);
    this.puffMesh.frustumCulled = false; this.puffMesh.renderOrder = 5; this.puffMesh.count = PUFFS; this.puffMesh.visible = false; scene.add(this.puffMesh);
    this.puffs = Array.from({ length: PUFFS }, () => ({ t: 9, life: 2, p: new THREE.Vector3(), v: new THREE.Vector3(), s0: 1, s1: 2, seed: 0 })); this.puffI = 0;
    this.m4 = new THREE.Matrix4(); this.qI = new THREE.Quaternion(); this.s3 = new THREE.Vector3();
    this.zones = Array.from({ length: ZONES }, (_, k) => {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uBeat: { value: 0 }, uRing: { value: 0 }, uLime: ramp.uLime, uPale: ramp.uPale },
        vertexShader: decalVS, fragmentShader: FLOOR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      floor.rotation.x = -Math.PI / 2; floor.visible = false; floor.renderOrder = 1; scene.add(floor);
      const base = lightSprite(scene, glowTexture('poison'), true, 7); // the soft glow at the arrow's foot
      const pockets = Array.from({ length: POCKETS }, () => lightSprite(scene, glowTexture('poison'), true, 6));
      return { floor, base, pockets, puffAt: 0, live: false, id: 0, x: 0, z: 0, r: 3, t: 0, endT: -1, fx: 0, fz: 0, dir: new THREE.Vector3(), landed: false };
    });
    this.flash = lightSprite(scene, glowTexture('poison'), true, 10); this.flashT = 9; this.flashY = 0;
    this.plumes = Array.from({ length: PLUMES * ZONES }, () => ({ t: 9, life: 3, x: 0, z: 0, zone: null, ph: 0, amp: 0.3, rise: 0.6, len: 1.6 }));
    this.specks = Array.from({ length: SPECKS }, () => ({ t: 9, life: 2, p: new THREE.Vector3(), v: new THREE.Vector3(), ph: 0 }));
    this.rnd = mulberry32(47); this.t = 0;
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: 12 }, () => new THREE.Vector3()); this.p = new THREE.Vector3(); this.side = new THREE.Vector3();
  }
  // the rules' 'area' of a Miasma Arrow; from: the hero (the arrow arcs from the bow)
  begin(e, from) {
    const z = this.zones.find((q) => !q.live) || this.zones[0];
    Object.assign(z, { live: true, id: e.id, x: e.x, z: e.z, r: e.radius, t: 0, endT: -1, fx: from.x, fz: from.z, landed: false });
    // pinned nearly upright, leaning back a little the way it came (a clear arrow, not a stick on the ground)
    z.dir.set(e.x - from.x, 0, e.z - from.z).normalize().multiplyScalar(0.45); z.dir.y = -1; z.dir.normalize();
    z.floor.scale.setScalar(e.radius * 2.2); place(z.floor, e.x, 0.05, e.z); conformPlane(z.floor);
    z.puffAt = FLIGHT;
  }
  puff(z, big, kick = 1) {
    const q = this.puffs[this.puffI++ % PUFFS], r = this.rnd, a = r() * 6.283;
    q.t = 0; q.life = PUFF_LIFE * (0.8 + r() * 0.4); q.seed = r(); q.zx = z.x; q.zz = z.z; q.zr = z.r;
    q.p.set(z.x + Math.cos(a) * 0.2, 0.3 + r() * 0.2, z.z + Math.sin(a) * 0.2);
    const sp = z.r * (0.7 + r() * 0.6) / q.life * 2.2 * kick;
    q.v.set(Math.cos(a) * sp, 0.06 + r() * 0.12, Math.sin(a) * sp);
    q.s0 = big ? 1.4 : 0.9 + r() * 0.4; q.s1 = (big ? 3.0 : 2.0 + r() * 0.9) * Math.min(1.2, z.r / 2.8);
  }
  // the rules' 'areaEnd': the gas sinks and thins
  end(id) { const z = this.zones.find((q) => q.live && q.id === id); if (z && z.endT < 0) z.endT = z.t; }
  hide(z) { for (const m of [z.floor, z.base, ...z.pockets]) m.visible = false; }
  update(dt) {
    this.t += dt;
    this.shaft.begin(); this.soft.begin(); this.glow.begin();
    const two = this.two, three = this.three, r = this.rnd;
    for (const z of this.zones) {
      if (!z.live) continue;
      z.t += dt;
      const t = z.t;
      if (t < FLIGHT) { // the arrow's flight: a low arc from the bow onto the centre
        const u = t / FLIGHT, h = (1 - u) * 1.4 + 4 * 1.6 * u * (1 - u);
        this.p.set(z.fx + (z.x - z.fx) * u, h, z.fz + (z.z - z.fz) * u);
        this.side.set(z.x - z.fx, -1.4 + 6.4 * (1 - 2 * u), z.z - z.fz).normalize();
        two[0].copy(this.p).addScaledVector(this.side, -SHAFT); two[1].copy(this.p);
        sw = 0.05; this.shaft.strip(two, shaftW, 1, [0.26, 0.2, 0.1]);
        three[0].copy(this.p).addScaledVector(this.side, -1.4); three[1].copy(this.p).addScaledVector(this.side, -0.5); three[2].copy(this.p);
        sw = 0.08; this.glow.strip(three, glowW, 0.9, LIME);
        continue;
      }
      if (!z.landed) { // the hero frame: a white-green flash, and a burst of gas rolling out at once
        z.landed = true; this.flashT = 0; placeV(this.flash, this.p.set(z.x, 0, z.z)); this.flashY = this.flash.position.y;
        for (let i = 0; i < 12; i++) this.puff(z, i % 3 === 0, 1.5);
      }
      const live = t - FLIGHT, ending = z.endT >= 0 ? Math.min(1, (t - z.endT) / 0.8) : 0;
      if (ending >= 1) { z.live = false; this.hide(z); continue; }
      const grow = 1 - Math.pow(1 - Math.min(1, live / 0.35), 3), beat = z.endT < 0 ? 1 - (live % BEAT) / BEAT : 0, beatK = beat * beat;
      // the gas: puffs roll out from the arrow along the floor and spread over the circle, a bigger one
      // on each beat; they keep coming while the zone is open
      if (z.endT < 0) while (z.puffAt <= t) { this.puff(z, Math.round((z.puffAt - FLIGHT) / (BEAT / 6)) % 6 === 0); z.puffAt += BEAT / 6; }
      // floor glow, its beat ring and rim
      z.floor.visible = true; const F = z.floor.material.uniforms;
      F.uA.value = grow * (1 - ending); F.uBeat.value = beatK; F.uRing.value = z.endT < 0 ? Math.min(1, ((live % BEAT) / BEAT) * 1.2) : 0;
      // the pinned arrow: its shaft up out of the ground, dark fletching at the top, a soft glow round its
      // foot that swells on the beat, and thin vapour curling up off it (the gas comes out of the arrow)
      const d = z.dir, top = this.side.set(z.x - d.x * SHAFT * 0.75, -d.y * SHAFT * 0.75, z.z - d.z * SHAFT * 0.75);
      two[0].set(z.x, 0.02, z.z); two[1].copy(top);
      sw = 0.06; this.shaft.strip(two, shaftW, 1 - ending, [0.26, 0.2, 0.11]);
      for (const sg of [1, -1]) {
        two[0].copy(top).addScaledVector(d, 0.22); two[1].copy(top).addScaledVector(d, -0.02); two[1].x += -d.z * 0.09 * sg; two[1].z += d.x * 0.09 * sg; two[1].y += 0.04;
        sw = 0.055; this.shaft.strip(two, shaftW, 1 - ending, [0.32, 0.5, 0.16]);
      }
      // a camera-facing glow cut by the ground shows a straight edge: keep its centre half its size up
      const bs = 0.7 + 0.5 * beatK;
      z.base.visible = true; placeV(z.base, this.p.set(z.x, 0.5 * bs, z.z));
      z.base.scale.setScalar(bs); z.base.material.opacity = (0.4 + 0.35 * beatK) * grow * (1 - ending);
      if (z.endT < 0) for (let i = 0; i < 2; i++) {
        const ph = this.t * 1.4 + i * 3.1, k = (this.t * 0.9 + i * 0.5) % 1;
        for (let j = 0; j < this.pts.length; j++) { const s = j / (this.pts.length - 1), h = 0.1 + (0.4 + 0.9 * k) * s; this.pts[j].set(z.x + 0.12 * Math.sin(h * 5 + ph) * s, h, z.z + 0.12 * Math.cos(h * 4 + ph) * s); }
        sw = 0.07; this.soft.strip(this.pts, plumeW, 0.45 * (1 - k), BRIGHT);
      }
      // pockets of light wandering inside the gas, low down
      z.pockets.forEach((s, i) => {
        const a = this.t * (0.4 + 0.15 * i) + i * 1.9, rr = z.r * (0.25 + 0.4 * (0.5 + 0.5 * Math.sin(this.t * 0.7 + i * 2.3)));
        s.visible = true; placeV(s, this.p.set(z.x + Math.cos(a) * rr, 0.35, z.z + Math.sin(a) * rr));
        s.scale.setScalar(z.r * (0.7 + 0.2 * Math.sin(this.t * 2 + i))); s.material.opacity = 0.32 * grow * (1 - ending) * (0.7 + 0.3 * Math.sin(this.t * 3 + i));
      });
      // plumes and specks are born while it is open
      if (z.endT < 0) {
        if (r() < dt * 2.6) { const q = this.plumes.find((x) => x.t >= x.life); if (q) { const a = r() * 6.283, rr = Math.sqrt(r()) * z.r * 0.6; Object.assign(q, { t: 0, life: 1.6 + r() * 0.8, x: z.x + Math.cos(a) * rr, z: z.z + Math.sin(a) * rr, zone: z, ph: r() * 6.283, amp: 0.2 + r() * 0.2, rise: 0.7 + r() * 0.4, len: 1.1 + r() * 0.6 }); } }
        if (r() < dt * 22) { const q = this.specks.find((x) => x.t >= x.life); if (q) { const a = r() * 6.283, rr = r() * z.r * 0.5; q.t = 0; q.life = 1.2 + r() * 1.0; q.ph = r() * 6.283; q.p.set(z.x + Math.cos(a) * rr, 0.15 + r() * 0.9, z.z + Math.sin(a) * rr); const sp = 0.4 + r() * 0.8; q.v.set(Math.cos(a) * sp, 0.05 + r() * 0.1, Math.sin(a) * sp); } }
      }
    }
    // plumes: columns lifting off the gas, twisting into thin ribbons, thinning as they climb
    for (const q of this.plumes) {
      if (q.t >= q.life) continue;
      q.t += dt; const u = q.t / q.life, fade = Math.min(1, u / 0.15) * (1 - Math.max(0, (u - 0.5) / 0.5)), head = 0.4 + q.rise * q.t, tail = Math.max(0.25, head - q.len);
      for (let i = 0; i < this.pts.length; i++) {
        const s = i / (this.pts.length - 1), h = tail + (head - tail) * s;
        this.pts[i].set(q.x + q.amp * Math.sin(h * 2.2 + q.t * 1.5 + q.ph) * (0.4 + s), h, q.z + q.amp * Math.cos(h * 1.7 + q.t * 1.2 + q.ph) * (0.4 + s));
      }
      const tw = Math.sin(q.t * 2.4 + q.ph) > 0;
      sw = 0.22; this.soft.strip(this.pts, plumeW, 0.28 * fade, tw ? LIME : VIOLET);
      sw = 0.08; this.soft.strip(this.pts, plumeW, 0.32 * fade, tw ? BRIGHT : OLIVE);
    }
    // specks drifting out through the gas, twinkling
    for (const q of this.specks) {
      if (q.t >= q.life) continue;
      q.t += dt; const u = q.t / q.life;
      q.p.addScaledVector(q.v, dt); q.v.multiplyScalar(1 - 0.8 * dt);
      const a = Math.min(1, u * 5) * Math.min(1, (1 - u) * 3) * (0.6 + 0.4 * Math.sin(q.t * 9 + q.ph));
      if (a < 0.1) continue;
      two[0].set(q.p.x - 0.05, q.p.y, q.p.z); two[1].set(q.p.x + 0.05, q.p.y, q.p.z);
      sw = 0.09; this.glow.strip(two, dotW, a, a > 0.7 ? PALE : BRIGHT);
    }
    // puffs: drift out with drag (fast burst, slow drift), swell, rise a little, thin away
    let any = false;
    for (let i = 0; i < PUFFS; i++) {
      const q = this.puffs[i]; q.t += dt;
      const age = q.t / q.life, on = age < 1;
      this.life[i * 2] = on ? age : -1; this.life[i * 2 + 1] = q.seed;
      if (!on) continue;
      any = true;
      q.p.addScaledVector(q.v, dt); q.v.x *= 1 - 1.4 * dt; q.v.z *= 1 - 1.4 * dt;
      // the gas stays over the true area: a puff reaching its edge stops spreading
      const dx = q.p.x - q.zx, dz = q.p.z - q.zz, dd = Math.hypot(dx, dz);
      if (dd > q.zr * 0.85) { q.p.x = q.zx + dx / dd * q.zr * 0.85; q.p.z = q.zz + dz / dd * q.zr * 0.85; q.v.x = q.v.z = 0; }
      const s = q.s0 + (q.s1 - q.s0) * (1 - Math.pow(1 - age, 2));
      this.p.copy(q.p); this.p.y += fxGround.y(q.p.x, q.p.z) + s * 0.2; this.hgt[i] = q.p.y + s * 0.2;
      this.m4.compose(this.p, this.qI, this.s3.setScalar(s)); this.puffMesh.setMatrixAt(i, this.m4);
    }
    if (any || this.puffMesh.visible) { this.puffMesh.instanceMatrix.needsUpdate = true; this.puffMesh.geometry.attributes.aLife.needsUpdate = true; this.puffMesh.geometry.attributes.aH.needsUpdate = true; }
    this.puffMesh.visible = any;
    // the landing's flash
    this.flashT += dt; const fk = this.flashT / 0.2;
    this.flash.visible = fk < 1; if (this.flash.visible) { const fs = 1.2 + fk * 1.6; this.flash.scale.setScalar(fs); this.flash.position.y = this.flashY + 0.5 * fs; this.flash.material.opacity = 1 - fk; }
    this.shaft.end(); this.soft.end(); this.glow.end();
  }
  clear() {
    for (const z of this.zones) { z.live = false; this.hide(z); }
    for (const q of this.plumes) q.t = q.life = 9; for (const q of this.specks) q.t = q.life = 9; for (const q of this.puffs) q.t = 9; this.puffMesh.visible = false;
    this.flashT = 9; this.flash.visible = false;
  }
  get busy() { return this.zones.some((z) => z.live) || this.plumes.some((q) => q.t < q.life) || this.puffMesh.visible; }
}
