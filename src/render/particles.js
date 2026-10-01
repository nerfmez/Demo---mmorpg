// One pooled particle system, additive or normal blend. Shape 0 is a soft round dot; other
// shapes are hard-edged cartoon cut-outs from the shared atlas (fx-shapes.js), each with a spin.
import * as THREE from 'three';
import { shapeAtlas, shapeIndex, ATLAS_COLS, ATLAS_ROWS } from './fx-shapes.js';

const SCRATCH = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export class Particles {
  constructor(capacity = 2500, { additive = true } = {}) {
    this.cap = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.core = new Float32Array(capacity * 3);
    // colour over life: rim and core go from *0 to *1, starting after the fraction fade[i] of the life
    this.col0 = new Float32Array(capacity * 3);
    this.col1 = new Float32Array(capacity * 3);
    this.core0 = new Float32Array(capacity * 3);
    this.core1 = new Float32Array(capacity * 3);
    this.fade = new Float32Array(capacity);
    this.span = new Float32Array(capacity); // fraction of the life the colour change takes
    this.hold = new Float32Array(capacity); // fraction of the life at full alpha before fading out
    this.swell = new Float32Array(capacity); // >0: grow to sizeEnd by this fraction, then shrink away
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('core', new THREE.BufferAttribute(this.core, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 400 }, uAtlas: { value: shapeAtlas() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color; attribute float shape; attribute float rot; attribute vec3 core;
        varying vec3 vCol; varying vec3 vCore; varying float vA; varying float vShape; varying float vRot; uniform float uScale;
        void main(){ vCol = color; vCore = core; vA = alpha; vShape = shape; vRot = rot; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec3 vCol; varying vec3 vCore; varying float vA; varying float vShape; varying float vRot;
        void main(){ vec2 c = gl_PointCoord - 0.5;
          if (vShape < 0.5) {
            float d = length(c) * 2.0; if (d > 1.0) discard;
            gl_FragColor = vec4(vCol, smoothstep(1.0, 0.35, d) * vA);
          } else {
            float s = sin(vRot), k = cos(vRot);
            vec2 r = vec2(k * c.x - s * c.y, s * c.x + k * c.y) + 0.5;
            if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) discard;
            float idx = floor(vShape + 0.5), col = mod(idx, ${ATLAS_COLS}.0), row = floor(idx / ${ATLAS_COLS}.0);
            vec4 t = texture2D(uAtlas, vec2((col + r.x) / ${ATLAS_COLS}.0, 1.0 - (row + r.y) / ${ATLAS_ROWS}.0));
            float a = t.a * vA; if (a < 0.01) discard;
            // two flat tones like a cel drawing: the rim in the particle colour, the inner cut-out in its core colour
            gl_FragColor = vec4(mix(vCol, vCore, t.r), a);
          }
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /**
   * Spawn one particle. shape is an fx-shapes.js name or index (0, the default, is a soft dot);
   * core is the colour of a shape's inner cut-out (white when omitted); colorEnd/coreEnd are the
   * colours they turn into over the life (fire cooling to smoke), starting after colorDelay of it
   * and taking colorSpan of it.
   * hold is the fraction of the life kept at full alpha before it fades (cartoon smoke stays solid).
   * swell > 0 makes the size pop out to sizeEnd by that fraction of the life and then shrink to
   * nothing, which is how cartoon smoke breaks up (puffs shrink instead of turning see-through).
   * rot is the starting angle (random when omitted), spin its turn rate in rad/s.
   */
  add(x, y, z, vx, vy, vz, { color = 0xffffff, core = null, colorEnd = null, coreEnd = null, colorDelay = 0, colorSpan = 1, hold = 0.15, swell = 0, size = 0.3, sizeEnd = null, life = 0.6, gravity = 0, drag = 1.5, alpha = 1, shape = 0, rot = null, spin = 0 } = {}) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    // no allocation per particle: garbage from thousands of Colors caused GC stutter
    this.setRGB(this.col0, i, color);
    this.setRGB(this.col1, i, colorEnd ?? color);
    this.setRGB(this.core0, i, core ?? WHITE);
    this.setRGB(this.core1, i, coreEnd ?? core ?? WHITE);
    for (let c = 0; c < 3; c++) {
      this.col[i * 3 + c] = this.col0[i * 3 + c];
      this.core[i * 3 + c] = this.core0[i * 3 + c];
    }
    this.fade[i] = Math.min(0.99, colorDelay);
    this.span[i] = Math.max(0.01, colorSpan);
    this.hold[i] = Math.min(0.95, Math.max(0.15, hold));
    this.swell[i] = Math.min(0.95, swell);
    this.size0[i] = size;
    this.size1[i] = sizeEnd ?? size * 0.2;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.alpha[i] = alpha;
    this.alpha0[i] = alpha;
    this.shape[i] = shapeIndex(shape);
    this.rot[i] = rot ?? Math.random() * Math.PI * 2;
    this.spin[i] = spin;
  }

  setRGB(arr, i, color) {
    const c = typeof color === 'number' || typeof color === 'string' ? SCRATCH.set(color) : color;
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }

  burst(x, y, z, n, opts = {}) {
    const sp = opts.speed ?? 3;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = opts.up ?? 0.5;
      const v = sp * (0.4 + Math.random() * 0.6);
      this.add(x, y, z, Math.sin(a) * v, (Math.random() * 0.8 + 0.2) * v * up + (opts.lift || 0), Math.cos(a) * v, {
        ...opts,
        size: (opts.size ?? 0.3) * (0.6 + Math.random() * 0.8),
        life: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6),
      });
    }
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const sw = this.swell[i];
      if (sw > 0) this.size[i] = t < sw ? this.size0[i] + (this.size1[i] - this.size0[i]) * Math.sqrt(t / sw) : this.size1[i] * (1 - ((t - sw) / (1 - sw)) ** 1.5);
      else this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const h = this.hold[i];
      this.alpha[i] = this.alpha0[i] * (t < 0.15 ? t / 0.15 : t < h ? 1 : 1 - (t - h) / (1 - h));
      this.rot[i] += this.spin[i] * dt;
      const f = this.fade[i];
      const tc = t <= f ? 0 : Math.min(1, (t - f) / this.span[i]);
      for (let c = i * 3; c < i * 3 + 3; c++) {
        this.col[c] = this.col0[c] + (this.col1[c] - this.col0[c]) * tc;
        this.core[c] = this.core0[c] + (this.core1[c] - this.core0[c]) * tc;
      }
    }
    this.count = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.core.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.shape.needsUpdate = true;
    g.attributes.rot.needsUpdate = true;
  }

  copy(from, to) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
      this.col[to * 3 + c] = this.col[from * 3 + c];
      this.core[to * 3 + c] = this.core[from * 3 + c];
      this.col0[to * 3 + c] = this.col0[from * 3 + c];
      this.col1[to * 3 + c] = this.col1[from * 3 + c];
      this.core0[to * 3 + c] = this.core0[from * 3 + c];
      this.core1[to * 3 + c] = this.core1[from * 3 + c];
    }
    this.size[to] = this.size[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.alpha[to] = this.alpha[from];
    this.alpha0[to] = this.alpha0[from];
    this.shape[to] = this.shape[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
    this.fade[to] = this.fade[from];
    this.hold[to] = this.hold[from];
    this.span[to] = this.span[from];
    this.swell[to] = this.swell[from];
  }
}
