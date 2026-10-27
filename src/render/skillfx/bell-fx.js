// Holy Bell (a priest's cooldown spell: a toll of light round the caster, 4.5 m, that stuns), held to the
// owner's bar (.claude/skills/skill-vfx), in Blessing of Light's holy white-gold.
//  - the cast: a great bell of light comes down over the priest (a see-through lathe shell: light bands
//    rising up it, its rim bright, its middle clear so the hero stays readable, drawn over the scene so
//    it stays white-gold on grass) and settles with a small bounce;
//  - the toll (the rules' 'nova'): the bell flashes and swells with a wobble, three rings of sound race
//    out to the true radius (in the air, nothing on the ground), stars burst outward and the camera
//    shakes; the struck monsters get the stun stars (MaceFx, on the rules' 'stunned');
//  - after: the bell lifts and fades away.
// One bell mesh, one ribbon pair and a pool of star sprites: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, fxGround } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, circlePoints, lightOf, starTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('holy');
const RING = 49, STARS = 14, WAVES = 3;
const DROP_FROM = 3.2, TOLL_LIFE = 0.55, FADE = 0.5, WAVE_LIFE = 0.5;
const BELL_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// light bands rising up the bell (noise carried upward), the rim bright, a brighter lip; uFlash lights it all
const BELL_FS = `varying vec2 vUv; varying float vFres; uniform float uT; uniform float uA; uniform float uFlash;
  ${NOISE}
  void main(){
    float v = vUv.y, ang = vUv.x * 6.2832; // noise taken round a circle: no seam where the lathe closes
    float n = fbm(vec2(cos(ang), sin(ang)) * 1.6 + (v * 2.5 - uT * 1.6) * vec2(0.8, 0.6));
    float band = smoothstep(0.45, 0.8, n), rim = pow(vFres, 1.5), lip = smoothstep(0.12, 0.0, v) + smoothstep(0.9, 1.0, v) * 0.5;
    float a = (0.04 + 0.75 * rim) * (0.6 + 0.4 * band) + 0.15 * band + 0.6 * lip + 0.5 * uFlash;
    vec3 c = mix(vec3(1.0, 0.8, 0.42), vec3(1.0, 0.99, 0.92), clamp(0.3 + band * 0.5 + lip + uFlash, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA); }`;
const out2 = (k) => 1 - (1 - k) * (1 - k);

// a church bell's profile (radius, height), the lip at the bottom, the crown at the top
function bellGeometry() {
  const prof = [[1.5, 0.0], [1.42, 0.12], [1.22, 0.42], [1.0, 0.85], [0.88, 1.35], [0.82, 1.85], [0.7, 2.25], [0.45, 2.52], [0.12, 2.62]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.userData.shared = true; return g;
}

export class BellFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(41); this.time = 0;
    this.core = new Ribbon(scene, camera, 900, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.bell = new THREE.Mesh(bellGeometry(), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uFlash: { value: 0 } }, vertexShader: BELL_VS, fragmentShader: BELL_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.bell.visible = false; this.bell.renderOrder = 7; scene.add(this.bell);
    const tex = starTexture('holy');
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, tex, false, 12), p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 0.4 }));
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.x = 0; this.z = 0; this.radius = 4.5; this.dropT = 9; this.dropLife = 0.35; this.tollT = 9; this.on = false;
    this.onShake = null;
  }
  // the cast: the bell comes down over (x, z) in `dur` seconds
  descend(x, z, dur) { this.x = x; this.z = z; this.dropT = 0; this.dropLife = Math.max(0.15, dur); this.tollT = 9; this.on = true; }
  // the rules' toll
  toll(x, z, radius) {
    this.x = x; this.z = z; this.radius = radius || 4.5; this.tollT = 0; this.on = true; this.dropT = 9;
    const r = this.rnd;
    this.stars.forEach((s, i) => {
      const a = (i / STARS) * 6.283 + r() * 0.3, sp = 3 + r() * 3;
      s.p.set(x + Math.sin(a) * 1.3, 0.4 + r() * 1.8, z + Math.cos(a) * 1.3); s.v.set(Math.sin(a) * sp, 0.5 + r(), Math.cos(a) * sp);
      s.t = -r() * 0.06; s.life = 0.5 + r() * 0.3; s.size = 0.35 + r() * 0.3;
    });
    this.onShake?.(0.12, 0.25);
  }
  follow(x, z) { if (this.dropT < this.dropLife) { this.x = x; this.z = z; } }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const u = this.bell.material.uniforms, x = this.x, z = this.z, y0 = fxGround.y(x, z);
    u.uT.value = this.time;
    if (this.dropT < this.dropLife) { // coming down, settling with a small bounce
      this.dropT += dt;
      const k = Math.min(1, this.dropT / this.dropLife), fall = 1 - out2(k), bounce = k > 0.8 ? Math.sin((k - 0.8) / 0.2 * Math.PI) * 0.08 : 0;
      this.bell.visible = true; this.bell.position.set(x, y0 + DROP_FROM * fall * fall + bounce, z); this.bell.scale.setScalar(0.9 + 0.1 * k);
      u.uA.value = Math.min(1, k * 2); u.uFlash.value = 0;
    } else if (this.tollT < TOLL_LIFE + FADE) { // the toll, then lifting away
      this.tollT += dt;
      const t = this.tollT, k = Math.min(1, t / TOLL_LIFE), sw = t < TOLL_LIFE ? 1 + 0.12 * Math.sin(Math.min(1, t / 0.12) * Math.PI) + 0.04 * Math.sin(t * 40) * (1 - k) : 1;
      const lift = Math.max(0, (t - TOLL_LIFE) / FADE);
      this.bell.visible = true; this.bell.position.set(x, y0 + 1.2 * out2(lift), z); this.bell.scale.set(sw, 1 + (sw - 1) * 0.4, sw);
      u.uFlash.value = Math.max(0, 1 - t / 0.25); u.uA.value = 1 - lift * lift;
      for (let i = 0; i < WAVES; i++) { // the rings of sound racing out to the true radius
        const wk = (t - i * 0.1) / WAVE_LIFE; if (wk < 0 || wk >= 1) continue;
        circlePoints(this.ring, x, z, 1.5 + (this.radius - 1.5) * out2(wk), 0.25 + 0.45 * i);
        W.v = (i ? 0.1 : 0.17) * (1 - 0.5 * wk); this.glow.strip(this.ring, lineGlowW, 0.5 * (1 - wk), LOOK.glow); this.core.strip(this.ring, lineW, (1 - wk * wk) * (i ? 0.8 : 1), LOOK.edge);
      }
    } else { this.bell.visible = false; this.on = false; }
    for (const s of this.stars) { // stars thrown out by the toll: pop, twinkle, slow, shrink away
      if (s.t >= s.life) { s.sp.visible = false; continue; }
      s.t += dt; if (s.t < 0) { s.sp.visible = false; continue; }
      const k = s.t / s.life;
      s.v.multiplyScalar(1 - 3 * dt); s.p.addScaledVector(s.v, dt);
      s.sp.visible = true; s.sp.position.copy(s.p); s.sp.scale.setScalar(s.size * Math.min(1, k * 6) * (1 - k * k) * (0.85 + 0.15 * Math.sin(s.t * 22))); s.sp.material.rotation = s.t * 3;
    }
    this.core.end(); this.glow.end();
  }
  clear() { this.dropT = 9; this.tollT = 9; this.on = false; this.bell.visible = false; for (const s of this.stars) { s.t = s.life = 9; s.sp.visible = false; } }
  get busy() { return this.on || this.stars.some((s) => s.t < s.life); }
}
