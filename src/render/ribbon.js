// A cloth ribbon (scarf tail) simulated as a short verlet chain and drawn as a strip.
// Tails are never stiff: the strip follows the real path of the anchor.
import * as THREE from 'three';

export class Ribbon {
  constructor({ segments = 8, length = 0.9, width = 0.16, color = '#c9302c', material = null, tatter = true } = {}) {
    this.n = segments + 1;
    this.segLen = length / segments;
    this.width = width;
    this.pts = [];
    this.prev = [];
    for (let i = 0; i < this.n; i++) {
      this.pts.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.widths = [];
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      let w = width * (1 - t * 0.25);
      if (tatter && i === this.n - 1) w *= 0.6;
      this.widths.push(w);
    }
    this.mesh = new THREE.Mesh(
      geo,
      material ||
        new THREE.MeshToonMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide })
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    // Physics points and vertices are world-space. A regional owner may be
    // translated/rotated, so cancel that parent transform on the mesh while
    // keeping it attached for visibility and resource disposal.
    this.mesh.matrixAutoUpdate = false;
    this.parentWorld = new THREE.Matrix4();
    this.hasParentTransform = false;
    this.initialized = false;
    this.side = new THREE.Vector3(1, 0, 0);
    this.delta = new THREE.Vector3();
  }

  /** anchor: world-space attach point; back: world direction the tail trails toward at rest; side: world-space ribbon width axis */
  update(dt, anchor, back, side, wind = 0) {
    const parent = this.mesh.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      if (!this.parentWorld.equals(parent.matrixWorld)) {
        this.parentWorld.copy(parent.matrixWorld);
        this.mesh.matrix.copy(this.parentWorld).invert();
        this.mesh.matrixWorldNeedsUpdate = true;
      }
      this.hasParentTransform = true;
    } else if (this.hasParentTransform) {
      this.parentWorld.identity();
      this.mesh.matrix.identity();
      this.mesh.matrixWorldNeedsUpdate = true;
      this.hasParentTransform = false;
    }
    const pts = this.pts;
    // a teleport (blink, respawn) would fling the cloth: start it hanging again
    if (this.initialized && pts[0].distanceTo(anchor) > 1.2) this.initialized = false;
    if (!this.initialized) {
      for (let i = 0; i < this.n; i++) {
        pts[i].copy(anchor).addScaledVector(back, i * this.segLen * 0.7);
        pts[i].y -= i * this.segLen * 0.7;
        this.prev[i].copy(pts[i]);
      }
      this.initialized = true;
    }
    const h = Math.min(dt, 1 / 30);
    const drag = 0.9;
    const windTime = performance.now() * 0.004;
    for (let i = 1; i < this.n; i++) {
      const p = pts[i];
      const v = this.delta.copy(p).sub(this.prev[i]).multiplyScalar(drag);
      this.prev[i].copy(p);
      p.add(v);
      p.y -= 5.5 * h * h;
      p.addScaledVector(back, 2.2 * h * h * (1 + wind));
      p.x += Math.sin(windTime + i) * 0.0009 * (1 + wind);
    }
    pts[0].copy(anchor);
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < this.n; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const d = this.delta.copy(b).sub(a);
        const len = d.length() || 1e-4;
        b.copy(a).addScaledVector(d, this.segLen / len);
      }
      for (let i = 1; i < this.n; i++) if (pts[i].y < 0.05) pts[i].y = 0.05;
    }
    for (let i = 0; i < this.n; i++) {
      const w = this.widths[i] / 2;
      const o = i * 6;
      this.pos[o] = pts[i].x - side.x * w;
      this.pos[o + 1] = pts[i].y - side.y * w;
      this.pos[o + 2] = pts[i].z - side.z * w;
      this.pos[o + 3] = pts[i].x + side.x * w;
      this.pos[o + 4] = pts[i].y + side.y * w;
      this.pos[o + 5] = pts[i].z + side.z * w;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  reset() {
    this.initialized = false;
  }
}
