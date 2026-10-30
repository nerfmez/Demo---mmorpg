// Holy Bell (a priest's cooldown spell: a toll of light round the caster, 4.5 m, that stuns), held to the
// owner's bar (.claude/skills/skill-vfx), in Blessing of Light's holy white-gold. Owner: the first version
// could be better, so the bell is richer (gold bands, a light inside) and the toll is a real event (a dome
// of sound, rays from the crown, an echo, each struck target rung).
//  - the cast: a great bell of light comes down over the priest (a see-through lathe shell: light bands
//    rising up it, gold bands at its lip, waist and shoulder, its rim bright, its middle clear so the hero
//    stays readable, drawn over the scene so it stays white-gold on grass) with a light glowing inside,
//    and settles with a small bounce;
//  - the toll (the rules' 'nova'): the bell flashes and swells with a wobble, a dome of sound (a
//    see-through half-sphere, bright at its rim) and three rings race out to the true radius (in the air,
//    nothing on the ground), rays of light shoot up from its crown, stars burst outward, the camera
//    shakes, and a smaller echo follows; each struck target rings (a ring round it and a star); the stunned
//    get the stun stars (MaceFx, on the rules' 'stunned');
//  - after: the bell lifts and fades away.
// Two shell meshes, one ribbon pair, a glow sprite and a pool of star sprites: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, fxGround } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, taperW, taperGlowW, circlePoints, lightOf, starTexture, glowTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('holy');
const RING = 49, STARS = 22, WAVES = 3, RAYS = 10, HITS = 8, HIT_RING = 17;
const DROP_FROM = 3.2, TOLL_LIFE = 0.6, FADE = 0.5, WAVE_LIFE = 0.5, DOME_LIFE = 0.5, ECHO = 0.32, RAY_LIFE = 0.45, HIT_LIFE = 0.4;
const SHELL_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// light bands rising up the bell (noise carried upward, taken round a circle: no seam where the lathe
// closes), gold bands at the lip, waist and shoulder, the rim bright; uFlash lights it all
const BELL_FS = `varying vec2 vUv; varying float vFres; uniform float uT; uniform float uA; uniform float uFlash;
  ${NOISE}
  void main(){
    float v = vUv.y, ang = vUv.x * 6.2832;
    float n = fbm(vec2(cos(ang), sin(ang)) * 1.6 + (v * 2.5 - uT * 1.6) * vec2(0.8, 0.6));
    float band = smoothstep(0.45, 0.8, n), rim = pow(vFres, 1.5);
    float gold = smoothstep(0.035, 0.0, abs(v - 0.05)) + smoothstep(0.025, 0.0, abs(v - 0.13)) + smoothstep(0.03, 0.0, abs(v - 0.55)) + smoothstep(0.03, 0.0, abs(v - 0.86));
    float a = (0.05 + 0.75 * rim) * (0.6 + 0.4 * band) + 0.15 * band + 0.85 * gold + 0.35 * uFlash;
    vec3 c = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.99, 0.93), clamp(0.3 + band * 0.5 + uFlash, 0.0, 1.0));
    c = mix(c, vec3(1.0, 0.72, 0.18), clamp(gold, 0.0, 1.0) * (1.0 - uFlash));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA); }`;
// the dome of sound: only its rim, thin, white-gold
const DOME_FS = `varying vec2 vUv; varying float vFres; uniform float uA;
  void main(){ float a = pow(vFres, 2.2) * 0.9 + 0.05; gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.5), vec3(1.0), vFres), a * uA); }`;
const out2 = (k) => 1 - (1 - k) * (1 - k);
const shell = (geo, fs, uniforms) => new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: SHELL_VS, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide }));

// a church bell's profile (radius, height), the lip at the bottom, the crown at the top
function bellGeometry() {
  const prof = [[1.5, 0.0], [1.42, 0.12], [1.22, 0.42], [1.0, 0.85], [0.88, 1.35], [0.82, 1.85], [0.7, 2.25], [0.45, 2.52], [0.12, 2.62]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.userData.shared = true; return g;
}

export class BellFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(41); this.time = 0;
    this.core = new Ribbon(scene, camera, 1500, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1500, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.bell = shell(bellGeometry(), BELL_FS, { uT: { value: 0 }, uA: { value: 0 }, uFlash: { value: 0 } });
    this.bell.visible = false; this.bell.renderOrder = 7; scene.add(this.bell);
    const dg = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2); dg.userData.shared = true;
    this.dome = shell(dg, DOME_FS, { uA: { value: 0 } }); this.dome.visible = false; this.dome.renderOrder = 6; scene.add(this.dome);
    this.inner = lightSprite(scene, glowTexture('holy'), true, 8);
    const tex = starTexture('holy');
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, tex, false, 12), p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 0.4 }));
    this.starI = 0;
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.hring = Array.from({ length: HIT_RING }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.rays = Array.from({ length: RAYS }, () => ({ a: 0, out: 0.5, len: 2 }));
    this.hits = Array.from({ length: HITS }, () => ({ x: 0, y: 1, z: 0, t: 9 })); this.hitI = 0;
    this.x = 0; this.z = 0; this.radius = 4.5; this.dropT = 9; this.dropLife = 0.35; this.tollT = 9; this.on = false; this.echoed = true;
    this.onShake = null;
  }
  star(x, y, z, vx, vy, vz, size, life, delay = 0) {
    const s = this.stars[this.starI++ % STARS];
    s.p.set(x, y, z); s.v.set(vx, vy, vz); s.t = -delay; s.life = life; s.size = size;
  }
  // the cast: the bell comes down over (x, z) in `dur` seconds
  descend(x, z, dur) { this.x = x; this.z = z; this.dropT = 0; this.dropLife = Math.max(0.15, dur); this.tollT = 9; this.on = true; }
  // the rules' toll
  toll(x, z, radius) {
    this.x = x; this.z = z; this.radius = radius || 4.5; this.tollT = 0; this.on = true; this.dropT = 9; this.echoed = false;
    this.burst(1);
    this.rays.forEach((q, i) => { q.a = (i / RAYS) * 6.283 + this.rnd() * 0.3; q.out = 0.3 + this.rnd() * 0.4; q.len = 2 + this.rnd() * 1.4; });
    this.onShake?.(0.13, 0.28);
  }
  burst(k) { // stars thrown out round the bell
    const r = this.rnd, n = Math.round(12 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r() * 0.3, sp = (3 + r() * 3) * k;
      this.star(this.x + Math.sin(a) * 1.3, 0.4 + r() * 1.8, this.z + Math.cos(a) * 1.3, Math.sin(a) * sp, 0.5 + r(), Math.cos(a) * sp, (0.35 + r() * 0.3) * (0.6 + 0.4 * k), 0.5 + r() * 0.3, r() * 0.06);
    }
  }
  // a struck target rings: a ring round it and a star
  hit(c) {
    const h = this.hits[this.hitI++ % HITS]; h.x = c.x; h.y = c.y; h.z = c.z; h.t = 0;
    this.star(c.x, c.y + 0.5, c.z, 0, 0.6, 0, 0.55, 0.45);
  }
  follow(x, z) { if (this.dropT < this.dropLife) { this.x = x; this.z = z; } }
  waves(t, x, z, scale, alpha) { // rings racing out to the radius
    for (let i = 0; i < WAVES; i++) {
      const wk = (t - i * 0.1) / WAVE_LIFE; if (wk < 0 || wk >= 1) continue;
      circlePoints(this.ring, x, z, 1.5 + (this.radius * scale - 1.5) * out2(wk), 0.25 + 0.45 * i);
      W.v = (i ? 0.1 : 0.18) * (1 - 0.5 * wk) * (0.6 + 0.4 * alpha); this.glow.strip(this.ring, lineGlowW, 0.5 * (1 - wk) * alpha, LOOK.glow); this.core.strip(this.ring, lineW, (1 - wk * wk) * (i ? 0.8 : 1) * alpha, LOOK.edge);
    }
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const u = this.bell.material.uniforms, x = this.x, z = this.z, y0 = fxGround.y(x, z);
    u.uT.value = this.time;
    if (this.dropT < this.dropLife) { // coming down, settling with a small bounce; its light grows inside
      this.dropT += dt;
      const k = Math.min(1, this.dropT / this.dropLife), fall = 1 - out2(k), bounce = k > 0.8 ? Math.sin((k - 0.8) / 0.2 * Math.PI) * 0.08 : 0;
      this.bell.visible = true; this.bell.position.set(x, y0 + DROP_FROM * fall * fall + bounce, z); this.bell.scale.setScalar(0.9 + 0.1 * k);
      u.uA.value = Math.min(1, k * 2); u.uFlash.value = 0;
      this.inner.visible = true; this.inner.position.set(x, this.bell.position.y + 1.3, z); this.inner.scale.setScalar(1.2 + 1.3 * k); this.inner.material.opacity = 0.6 * k;
    } else if (this.tollT < TOLL_LIFE + FADE) { // the toll, the echo, then lifting away
      this.tollT += dt;
      const t = this.tollT, k = Math.min(1, t / TOLL_LIFE), sw = t < TOLL_LIFE ? 1 + 0.12 * Math.sin(Math.min(1, t / 0.12) * Math.PI) + 0.05 * Math.sin(t * 40) * (1 - k) : 1;
      const lift = Math.max(0, (t - TOLL_LIFE) / FADE), echoK = t - ECHO;
      const echoSw = echoK > 0 && echoK < 0.12 ? 0.06 * Math.sin(echoK / 0.12 * Math.PI) : 0;
      this.bell.visible = true; this.bell.position.set(x, y0 + 1.2 * out2(lift), z); this.bell.scale.set(sw + echoSw, 1 + (sw + echoSw - 1) * 0.4, sw + echoSw);
      u.uFlash.value = Math.max(0, 1 - t / 0.25, echoK > 0 ? 0.5 * (1 - echoK / 0.2) : 0); u.uA.value = 1 - lift * lift;
      this.inner.visible = true; this.inner.position.set(x, this.bell.position.y + 1.3, z); this.inner.scale.setScalar(2.4 + 1.6 * Math.max(0, 1 - t / 0.3)); this.inner.material.opacity = 0.45 * (1 - lift);
      // the dome of sound
      const dk = t / DOME_LIFE;
      this.dome.visible = dk < 1;
      if (this.dome.visible) { const r = 1.4 + (this.radius - 1.4) * out2(dk); this.dome.position.set(x, y0, z); this.dome.scale.set(r, r * 0.55, r); this.dome.material.uniforms.uA.value = 1 - dk * dk; }
      // the rings, and a smaller echo
      this.waves(t, x, z, 1, 1);
      if (echoK > 0) { if (!this.echoed) { this.echoed = true; this.burst(0.5); } this.waves(echoK, x, z, 0.7, 0.6); }
      // rays of light shooting up from the crown
      const rk = t / RAY_LIFE;
      if (rk < 1) for (const q of this.rays) {
        const cy = this.bell.position.y + 2.6, sx = Math.sin(q.a) * q.out, sz = Math.cos(q.a) * q.out, d0 = 0.2 + q.len * 0.5 * rk, d1 = 0.4 + q.len * out2(Math.min(1, rk * 2.5));
        this.three[0].set(x + sx * d0, cy + d0, z + sz * d0); this.three[2].set(x + sx * d1, cy + d1, z + sz * d1); this.three[1].copy(this.three[0]).lerp(this.three[2], 0.5);
        W.v = 0.14 * (1 - rk); this.glow.strip(this.three, taperGlowW, 0.6 * (1 - rk), LOOK.glow); this.core.strip(this.three, taperW, 1 - rk * rk, LOOK.edge);
      }
    } else { this.bell.visible = false; this.dome.visible = false; this.inner.visible = false; this.on = false; }
    // each struck target rung: a ring round it, widening and fading
    for (const h of this.hits) {
      if (h.t >= HIT_LIFE) continue;
      h.t += dt; const k = h.t / HIT_LIFE;
      circlePoints(this.hring, h.x, h.z, 0.45 + 0.5 * out2(k), h.y);
      W.v = 0.09 * (1 - k); this.glow.strip(this.hring, lineGlowW, 0.6 * (1 - k), LOOK.glow); this.core.strip(this.hring, lineW, 1 - k * k, LOOK.edge);
    }
    for (const s of this.stars) { // stars: pop, twinkle, slow, shrink away
      if (s.t >= s.life) { s.sp.visible = false; continue; }
      s.t += dt; if (s.t < 0) { s.sp.visible = false; continue; }
      const k = s.t / s.life;
      s.v.multiplyScalar(1 - 3 * dt); s.p.addScaledVector(s.v, dt);
      s.sp.visible = true; s.sp.position.copy(s.p); s.sp.scale.setScalar(s.size * Math.min(1, k * 6) * (1 - k * k) * (0.85 + 0.15 * Math.sin(s.t * 22))); s.sp.material.rotation = s.t * 3;
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    this.dropT = 9; this.tollT = 9; this.on = false; this.bell.visible = false; this.dome.visible = false; this.inner.visible = false;
    for (const s of this.stars) { s.t = s.life = 9; s.sp.visible = false; } for (const h of this.hits) h.t = 9;
  }
  get busy() { return this.on || this.stars.some((s) => s.t < s.life) || this.hits.some((h) => h.t < HIT_LIFE); }
}
