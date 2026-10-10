import * as THREE from 'three';

// One frustum per camera, shared by the render-side entity/effect consumers.
// Conservative spheres include the body, its shadow and particles near the edge.
// A moved camera (including a snap/resize) refreshes immediately, before drawing.
const cameras = new WeakMap();
class CameraVisibility {
  constructor() {
    this.frustum = new THREE.Frustum();
    this.clip = new THREE.Matrix4();
    this.matrix = new Float64Array(16).fill(NaN);
    this.position = new THREE.Vector3();
  }

  update(camera) {
    camera.updateMatrixWorld();
    this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const elements = this.clip.elements;
    let changed = false;
    for (let i = 0; i < 16; i++) if (elements[i] !== this.matrix[i]) { changed = true; break; }
    if (changed) {
      this.matrix.set(elements);
      this.frustum.setFromProjectionMatrix(this.clip);
    }
    return this;
  }

  intersectsSphere(x, y, z, radius) {
    for (let i = 0; i < 6; i++) {
      const plane = this.frustum.planes[i], n = plane.normal;
      if (n.x * x + n.y * y + n.z * z + plane.constant < -radius) return false;
    }
    return true;
  }

  // Region parents may be translated in the unified world. Read their matrices,
  // rather than mistaking an NPC/marker's map-local position for world space.
  intersectsObject(object, radius, height = 0) {
    object.updateWorldMatrix(true, false);
    const p = this.position.setFromMatrixPosition(object.matrixWorld);
    return this.intersectsSphere(p.x, p.y + height, p.z, radius);
  }
}

export function cameraVisibility(camera) {
  let state = cameras.get(camera);
  if (!state) cameras.set(camera, state = new CameraVisibility());
  return state.update(camera);
}

// Three.js updates every descendant's matrices even under invisible roots.
// Sleeping an entire dynamic rig avoids that work as well as its draw/animation.
// Visibility tests use updateWorldMatrix() on the root alone; when it becomes
// visible the ordinary renderer pass updates every child before rendering.
const sleepingRoots = new WeakSet();
export function sleepOffscreenMatrices(root) {
  if (sleepingRoots.has(root)) return;
  sleepingRoots.add(root);
  const update = root.updateMatrixWorld;
  root.updateMatrixWorld = function(force) {
    if (!this.visible) return;
    update.call(this, force);
  };
}
