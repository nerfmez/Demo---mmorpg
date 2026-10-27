// Blessing of Light (a priest spell: +10% damage and 10% less damage taken for 12 s within 9 m), held to
// the owner's bar (.claude/skills/skill-vfx). Owner: the first version (a flat strip of light, thin rings)
// should be prettier, so it is built like the reference skills: a real column of light carved from flowing
// noise, crisp twinkling stars, and a golden halo that stays.
//  - gather (the cast): motes of light drift down onto the hero and a few stars twinkle above it;
//  - bestow (the rules' 'buff'): a column of light drops from the sky onto the hero (an open cylinder:
//    streaks of light flow down it, its rim bright, its middle see-through, drawn over the scene so it
//    stays white-gold on grass), stars pop and twinkle round it as they drift down, a soft golden ring
//    goes out to the true radius (in the air, nothing on the ground) and a halo lights over each body the
//    buff reached with a bright pop; a glint flares where the light lands;
//  - while it lasts: the halo stays over each buffed body, softly breathing, and now and then a star
//    twinkles beside it.
// One column mesh, one ribbon pair and a pool of star sprites: light on an iPad for a 12 s buff.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, circlePoints, drawSparks, spark, lightOf, starTexture, flareTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('holy');
const STARS = 24, HALO = 21, RING = 49, SPARKS = 40;
const DROP = 0.14, HOLD = 0.5, COLUMN = 0.95, RING_LIFE = 0.6, POP = 0.5, TWINKLE_EVERY = 0.7;
const COLUMN_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// streaks of light flowing down the column (noise carried down with time), its rim bright; revealed from
// the top down to uDrop with a bright leading front
const COLUMN_FS = `varying vec2 vUv; varying float vFres; uniform float uT; uniform float uA; uniform float uDrop;
  ${NOISE}
  void main(){
    float y = vUv.y, front = y - (1.0 - uDrop); if (front < 0.0) discard;
    float n = fbm(vec2(vUv.x * 9.0, y * 2.2 + uT * 3.2));
    float streak = smoothstep(0.42, 0.78, n);
    float fadeY = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 1.0, y) * 0.85);
    float rim = pow(vFres, 1.6), lead = smoothstep(0.05, 0.0, front) * (1.0 - step(0.999, uDrop)) * 0.6;
    float a = ((0.12 + 0.6 * rim) * (0.55 + 0.45 * streak) + 0.35 * streak + lead) * fadeY;
    vec3 c = mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 0.99, 0.93), clamp(0.35 + streak * 0.5 + lead, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA); }`;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class BlessFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(83);
    this.core = new Ribbon(scene, camera, 1200, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1200, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const geo = new THREE.CylinderGeometry(0.8, 0.6, 7, 28, 1, true).translate(0, 3.5, 0); geo.userData.shared = true;
    this.column = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uDrop: { value: 0 } }, vertexShader: COLUMN_VS, fragmentShader: COLUMN_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.column.visible = false; this.column.renderOrder = 7; scene.add(this.column);
    const tex = starTexture('holy');
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, tex, false, 12), p: new THREE.Vector3(), vy: 0, t: 9, life: 1, size: 0.3, spin: 0 }));
    this.starI = 0;
    this.flare = lightSprite(scene, flareTexture('holy'), true, 11);
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.halo = Array.from({ length: HALO }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.x = 0; this.z = 0; this.radius = 9; this.t = 9; this.time = 0; this.twinkle = 0;
    this.halos = []; // bodies [{x, z}] holding the blessing this frame (the director refills it)
  }
  // a star pops at (x, y, z), twinkles and drifts down
  star(x, y, z, size, life, delay = 0, vy = -0.5) {
    const s = this.stars[this.starI++ % STARS];
    s.p.set(x, y, z); s.vy = vy; s.t = -delay; s.life = life; s.size = size; s.spin = (this.rnd() - 0.5) * 3;
  }
  // the cast: motes drift down onto the hero, stars twinkle above it
  gather(x, z, dur) {
    this.x = x; this.z = z;
    const r = this.rnd;
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.283, d = 0.3 + r() * 1.0, life = dur * (0.75 + r() * 0.25);
      this.p.set(x + Math.sin(a) * d, 2.6 + r() * 0.9, z + Math.cos(a) * d);
      this.v.set(x - this.p.x, 1.2 - this.p.y, z - this.p.z).multiplyScalar(1 / life);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, life, 0.05, LOOK);
    }
    for (let i = 0; i < 3; i++) { const a = r() * 6.283; this.star(x + Math.sin(a) * 0.7, 2.4 + r() * 0.6, z + Math.cos(a) * 0.7, 0.5, dur + 0.2, i * dur * 0.25); }
  }
  // the buff lands
  bestow(x, z, radius) {
    this.x = x; this.z = z; this.radius = radius || 9; this.t = 0;
    const r = this.rnd;
    for (let i = 0; i < 12; i++) {
      const a = r() * 6.283, d = 0.4 + r() * 1.1;
      this.star(x + Math.sin(a) * d, 0.6 + r() * 2.4, z + Math.cos(a) * d, 0.45 + r() * 0.4, 0.7 + r() * 0.5, 0.05 + r() * 0.35, -0.3 - r() * 0.4);
    }
  }
  follow(x, z) { this.x = x; this.z = z; }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const x = this.x, z = this.z;
    if (this.t < 1.5) {
      this.t += dt;
      const t = this.t, u = this.column.material.uniforms;
      // the column: drops from the sky, holds, then narrows into the hero and fades
      this.column.visible = t < COLUMN;
      if (this.column.visible) {
        const sink = Math.max(0, (t - HOLD) / (COLUMN - HOLD));
        u.uDrop.value = Math.min(1, t / DROP); u.uT.value = this.time; u.uA.value = 1 - sink * sink;
        this.column.position.set(x, 0, z); this.column.scale.set(1 - 0.7 * sink, 1, 1 - 0.7 * sink);
      }
      // a glint where the light lands
      const fk = (t - DROP * 0.8) / 0.4;
      this.flare.visible = fk > 0 && fk < 1;
      if (this.flare.visible) { this.flare.position.set(x, 1.1, z); this.flare.scale.setScalar(3 * (0.5 + 0.5 * out2(Math.min(1, fk * 4))) * (1 - 0.4 * fk)); this.flare.material.opacity = 1 - fk * fk; }
      // the ring going out to the true radius, soft and golden, with a fainter one behind it
      for (let i = 0; i < 2; i++) {
        const rk = (t - 0.08 - i * 0.12) / RING_LIFE; if (rk < 0 || rk >= 1) continue;
        circlePoints(this.ring, x, z, 0.8 + (this.radius - 0.8) * out2(rk), 0.9);
        W.v = (i ? 0.08 : 0.14) * (1 - 0.5 * rk); this.glow.strip(this.ring, lineGlowW, 0.35 * (1 - rk), LOOK.glow); this.core.strip(this.ring, lineW, (i ? 0.55 : 0.9) * (1 - rk * rk), LOOK.edge);
      }
    } else { this.column.visible = false; this.flare.visible = false; }
    // the halos: a bright pop as the blessing lands, then a soft breathing glow while it lasts
    const pop = this.t < POP ? 1 - this.t / POP : 0, breathe = 0.75 + 0.25 * Math.sin(this.time * 3);
    for (const b of this.halos) {
      circlePoints(this.halo, b.x, b.z, 0.32 * (1 + 0.35 * pop), 2.25);
      W.v = 0.07 + 0.06 * pop; this.glow.strip(this.halo, lineGlowW, 0.5 * breathe + 0.5 * pop, LOOK.glow); this.core.strip(this.halo, lineW, Math.min(1, 0.8 * breathe + pop), LOOK.edge);
    }
    // a star now and then beside each blessed body
    this.twinkle += dt;
    if (this.twinkle >= TWINKLE_EVERY) {
      this.twinkle -= TWINKLE_EVERY;
      for (const b of this.halos) { const a = this.rnd() * 6.283; this.star(b.x + Math.sin(a) * 0.5, 1.0 + this.rnd() * 1.3, b.z + Math.cos(a) * 0.5, 0.42, 0.8); }
    }
    // the stars: pop with an overshoot, twinkle (a quick pulse and a turn), drift down, shrink away
    for (const s of this.stars) {
      if (s.t >= s.life) { s.sp.visible = false; continue; }
      s.t += dt; if (s.t < 0) { s.sp.visible = false; continue; }
      const k = s.t / s.life, grow = Math.min(1, k * 6), size = s.size * (grow < 1 ? grow * 1.3 : 1.3 - 0.3 * Math.min(1, (k - 1 / 6) * 4)) * (1 - k * k) * (0.85 + 0.15 * Math.sin(s.t * 22));
      s.p.y += s.vy * dt;
      s.sp.visible = true; s.sp.position.copy(s.p); s.sp.scale.setScalar(size); s.sp.material.rotation = s.spin * s.t; s.sp.material.opacity = 1;
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 0);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.t = 9; this.column.visible = false; this.flare.visible = false; this.halos.length = 0;
    for (const s of this.stars) { s.t = s.life = 9; s.sp.visible = false; }
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.t < 1.5 || this.halos.length > 0 || this.sparks.length > 0 || this.stars.some((s) => s.t < s.life); }
}
