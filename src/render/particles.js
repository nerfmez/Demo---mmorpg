// One pooled particle system: soft round dots, no outline, additive or normal blend.
import * as THREE from 'three';

const SCRATCH = new THREE.Color();

export class Particles {
  constructor(capacity = 2500, { additive = true } = {}) {
    this.cap = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.uploadAttributes = Object.values(geo.attributes);
    this.uniforms = { uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vCol; varying float vA; uniform float uScale;
        void main(){ vCol = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;
          float a = smoothstep(1.0, 0.35, d) * vA; gl_FragColor = vec4(vCol, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Spawn one particle. */
  add(x, y, z, vx, vy, vz, { color = 0xffffff, size = 0.3, sizeEnd = null, life = 0.6, gravity = 0, drag = 1.5, alpha = 1 } = {}) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    // no allocation per particle: garbage from thousands of Colors caused GC stutter
    const c = typeof color === 'number' || typeof color === 'string' ? SCRATCH.set(color) : color;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.size0[i] = size;
    this.size1[i] = sizeEnd ?? size * 0.2;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.alpha[i] = alpha;
    this.alpha0[i] = alpha;
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
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.alpha[i] = this.alpha0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
    this.count = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    // Upload only the live prefix. Unused pooled slots cannot contribute to a draw.
    // Mark the whole live prefix so spawn/swap removal and multiple simulation
    // updates before a render cannot leave stale particle data on the GPU.
    if (n > 0) for (const attribute of this.uploadAttributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, n * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  copy(from, to) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
      this.col[to * 3 + c] = this.col[from * 3 + c];
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
  }
}
