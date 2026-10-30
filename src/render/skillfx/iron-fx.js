// Iron Body (a heavy-weapon self buff: 6 s of no knockback and 15% less damage taken), held to the owner's
// bar (.claude/skills/skill-vfx), in the bench's light-and-ribbon language with a steel tint.
//  - gather (the cast): short steel speed lines rush in to the chest;
//  - harden (the rules' 'buff'): a shell of hexagon plates sweeps up round the body (an open cylinder whose
//    shader draws a hex grid, bright at its silhouette and along the rising front, see-through in the
//    middle so the hero stays readable), holds, then shrinks into the body; a steel glint flares at the
//    chest, a ring of light snaps out at the waist (in the air: nothing on the ground) and sparks fly;
//  - while it lasts: every 1.2 s a sheen ring slides up the body and glints at the top.
// One shell mesh, one ribbon pair, one glint sprite and pooled sparks: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, fxGround } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, taperW, taperGlowW, circlePoints, drawSparks, spark, lightOf, flareTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('steel');
const GATHER = 10, RING = 33, SPARKS = 40, SHEEN_EVERY = 1.2, SHEEN = 0.4;
const REVEAL = 0.14, HOLD = 0.4, SHELL_LIFE = 0.7;
const SHELL_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// a hex grid (the cells' edges), revealed from the bottom up to uReveal with a bright front
const SHELL_FS = `varying vec2 vUv; varying float vFres; uniform float uReveal; uniform float uA;
  ${NOISE}
  float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.73))), p.x); }
  void main(){
    float front = uReveal - vUv.y; if (front < 0.0) discard;
    vec2 p = vec2(vUv.x * 12.0, vUv.y * 6.0), r = vec2(1.0, 1.73), hh = r * 0.5;
    vec2 a = mod(p, r) - hh, b = mod(p - hh, r) - hh, gv = dot(a, a) < dot(b, b) ? a : b;
    float edge = 0.5 - hexDist(gv);
    float line = smoothstep(0.075, 0.0, edge), cell = h(p - gv);
    float band = smoothstep(0.14, 0.0, front);
    // drawn over the scene (not added to it) so it keeps its steel colour on any ground
    float k = (line * 0.9 + 0.12 + 0.08 * cell) * (0.3 + 0.7 * pow(vFres, 1.3)) + band * 0.9;
    vec3 c = mix(vec3(0.42, 0.5, 0.64), vec3(0.88, 0.93, 1.0), clamp(line + band, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(k, 0.0, 1.0) * uA); }`;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class IronFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(19);
    this.core = new Ribbon(scene, camera, 900, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const geo = new THREE.CylinderGeometry(0.62, 0.62, 1.9, 28, 1, true).translate(0, 0.95, 0); geo.userData.shared = true;
    this.shell = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uReveal: { value: 0 }, uA: { value: 0 } }, vertexShader: SHELL_VS, fragmentShader: SHELL_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.shell.visible = false; this.shell.renderOrder = 7; scene.add(this.shell);
    this.flare = lightSprite(scene, flareTexture('steel'), true, 11);
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.lines = Array.from({ length: GATHER }, () => ({ a: 0, y: 1, len: 1 }));
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.x = 0; this.z = 0; this.gT = 9; this.gLife = 0.2; this.t = 9; this.life = 0; this.sheen = 0;
    this.onShake = null;
  }
  // the cast: speed lines rush in to the chest over `dur` seconds
  gather(x, z, dur) {
    this.x = x; this.z = z; this.gT = 0; this.gLife = Math.max(0.12, dur);
    const r = this.rnd;
    for (const l of this.lines) { l.a = r() * 6.283; l.y = 0.6 + r() * 1.0; l.len = 0.4 + r() * 0.4; }
  }
  // the buff lands: the shell, the glint, the ring and the sparks; the sheen runs for `life` seconds
  harden(x, z, life) {
    this.x = x; this.z = z; this.t = 0; this.life = life; this.sheen = SHEEN_EVERY * 0.75;
    const r = this.rnd;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283 + r() * 0.3, sp = 3 + r() * 3;
      this.p.set(x + Math.sin(a) * 0.4, 0.8 + r() * 0.7, z + Math.cos(a) * 0.4);
      this.v.set(Math.sin(a) * sp, 1.5 + r() * 2, Math.cos(a) * sp);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.2 + r() * 0.15, 0.035, LOOK);
    }
    this.onShake?.(0.08, 0.12);
  }
  // the hero moves while it lasts: the effect follows
  follow(x, z) { this.x = x; this.z = z; }
  // the buff ended early (death, cleared)
  stop() { this.life = Math.min(this.life, this.t); }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const x = this.x, z = this.z;
    if (this.gT < this.gLife) {
      this.gT += dt;
      const k = Math.min(1, this.gT / this.gLife);
      for (const l of this.lines) {
        // each line runs in from 1.8 m to the body, its head leading
        const head = 1.8 - 1.45 * out2(k), tail = head + l.len * (1 - k * 0.5);
        this.three[0].set(x + Math.sin(l.a) * tail, l.y, z + Math.cos(l.a) * tail);
        this.three[2].set(x + Math.sin(l.a) * head, l.y, z + Math.cos(l.a) * head);
        this.three[1].copy(this.three[0]).lerp(this.three[2], 0.5);
        W.v = 0.035; const al = Math.sin(Math.PI * k);
        this.glow.strip(this.three, taperGlowW, 0.7 * al, LOOK.glow); this.core.strip(this.three, taperW, al, LOOK.edge);
      }
    }
    if (this.t < this.life) {
      this.t += dt;
      const t = this.t, y = fxGround.y(x, z);
      // the shell: up, held, then pulled into the body
      this.shell.visible = t < SHELL_LIFE;
      if (this.shell.visible) {
        const u = this.shell.material.uniforms, sink = Math.max(0, (t - HOLD) / (SHELL_LIFE - HOLD));
        u.uReveal.value = Math.min(1, t / REVEAL) * 1.02; u.uA.value = 1 - sink * sink;
        this.shell.position.set(x, y, z); this.shell.scale.set(1 - 0.35 * sink, 1 - 0.1 * sink, 1 - 0.35 * sink);
      }
      // the glint at the chest and the waist ring snapping out (in the air)
      const fk = t / 0.32;
      this.flare.visible = fk < 1;
      if (this.flare.visible) { this.flare.position.set(x, y + 1.25, z); this.flare.scale.setScalar(1.8 * (0.6 + 0.4 * out2(Math.min(1, fk * 3))) * (1 - fk * 0.5)); this.flare.material.opacity = 1 - fk * fk; }
      const rk = t / 0.3;
      if (rk < 1) {
        circlePoints(this.ring, x, z, 0.5 + 1.4 * out2(rk), 1.0);
        W.v = 0.07 * (1 - rk); this.glow.strip(this.ring, lineGlowW, 0.8 * (1 - rk), LOOK.glow); this.core.strip(this.ring, lineW, 1 - rk, LOOK.edge);
      }
      // the lasting sheen: a thin ring sliding up the body, then a small glint at the top
      if (t > SHELL_LIFE) {
        this.sheen += dt;
        if (this.sheen >= SHEEN_EVERY && this.life - t > SHEEN) this.sheen -= SHEEN_EVERY; // no sheen cut off by the end
      }
      const sk = this.sheen / SHEEN;
      if (t > SHELL_LIFE && sk < 1) {
        circlePoints(this.ring, x, z, 0.42 - 0.12 * sk, 0.15 + 1.55 * sk);
        W.v = 0.06; const al = Math.sin(Math.PI * sk);
        this.glow.strip(this.ring, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
        if (sk > 0.8) { this.flare.visible = true; this.flare.position.set(x + 0.2, y + 1.6, z); this.flare.scale.setScalar(0.7 * Math.sin(Math.PI * (sk - 0.8) / 0.2)); this.flare.material.opacity = 1; }
      }
    } else { this.shell.visible = false; this.flare.visible = false; }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 10);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.t = 9; this.life = 0; this.gT = 9; this.shell.visible = false; this.flare.visible = false;
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.t < this.life || this.gT < this.gLife || this.sparks.length > 0; }
}
