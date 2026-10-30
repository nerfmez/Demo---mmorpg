// The grotto's modelled kit (public/models/grotto/grotto-kit.glb, made by
// scripts/blender/grotto-kit.py): the carved gate, chests, crates, posts and corals. Shading is
// baked into vertex colours in Blender; here each piece gets a cel material that only tints it.
// Geometry is shared by every placement (instancing). The cave rooms themselves are cave.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonRamp } from '../toon.js';

const TINT = { rock: '#ffffff', stone: '#ffffff', wood: '#ffffff', metal: '#ffffff' };
const GLOW = { metal: ['#3a2a0a', 0.35] };

/** Load the kit. Resolves {has(name), geometry(name), material(name)}; rejects if the file is missing. */
export function loadGrottoKit(url = 'models/grotto/grotto-kit.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const pieces = new Map(), mats = new Map();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        g.computeBoundingSphere();
        g.userData.shared = true;
        pieces.set(o.name, { geometry: g, mat: o.material?.name || 'stone' });
        o.geometry.dispose();
        o.material?.dispose?.();
      });
      const material = (name) => {
        if (!mats.has(name)) {
          const [emissive, ei] = GLOW[name] || ['#000000', 0];
          const m = new THREE.MeshToonMaterial({ color: TINT[name] || '#ffffff', vertexColors: true, gradientMap: toonRamp(), emissive, emissiveIntensity: ei });
          m.userData.shared = true;
          mats.set(name, m);
        }
        return mats.get(name);
      };
      const corals = new Map();
      resolve({
        /** A glowing coral material in one colour (pale tips come from the vertex colours). */
        coralMaterial(color) {
          if (!corals.has(color)) {
            const m = new THREE.MeshToonMaterial({ color, vertexColors: true, gradientMap: toonRamp(), emissive: color, emissiveIntensity: 0.6 });
            m.userData.shared = true;
            corals.set(color, m);
          }
          return corals.get(color);
        },
        has: (name) => pieces.has(name),
        names: () => [...pieces.keys()],
        geometry: (name) => pieces.get(name)?.geometry,
        material: (name) => material(pieces.get(name)?.mat || 'stone'),
      });
    }, undefined, reject);
  });
}

/** A piece as one Mesh (for a single placement). */
export function kitMesh(kit, name) {
  const m = new THREE.Mesh(kit.geometry(name), kit.material(name));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Many placements of a piece as one InstancedMesh: list of {x, y, z, ry, s:[sx, sy, sz] | number, color?}. */
export function kitInstances(kit, name, list, material = kit.material(name)) {
  const inst = new THREE.InstancedMesh(kit.geometry(name), material, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((r, i) => {
    e.set(r.rx || 0, r.ry || 0, r.rz || 0, 'YXZ');
    q.setFromEuler(e);
    const sc = Array.isArray(r.s) ? r.s : [r.s ?? 1, r.s ?? 1, r.s ?? 1];
    m4.compose(p.set(r.x, r.y, r.z), q, s.set(...sc));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.set(r.color || '#ffffff'));
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.computeBoundingSphere();
  inst.name = `kit-${name}`;
  return inst;
}
