// Imported GLB models (data/models.json), e.g. Meshy weapons. They load once at boot and
// replace a gear base's procedural shape; until then (or if loading fails) the procedural
// shape is used. Geometry and textures are shared by every copy; each rig gets its own
// toon material so hit flashes still reach the weapon.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toonRamp, outlineMaterial } from './toon.js';
import { prepareHeroBase } from './skinned.js';

const loaded = new Map(); // "weapons/rusty_sword" -> {geometry, map, outline}

/** Load every model in the registry. Resolves when all have loaded or failed. */
export function loadModels(registry = {}) {
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [group, entries] of Object.entries(registry)) {
    if (group.startsWith('_')) continue;
    for (const [id, m] of Object.entries(entries)) {
      jobs.push(
        loader
          .loadAsync(m.file)
          .then((gltf) => {
            if (group === 'characters') {
              loaded.set(`${group}/${id}`, prepareHeroBase(gltf, m));
              return;
            }
            gltf.scene.updateMatrixWorld(true);
            let mesh = null;
            gltf.scene.traverse((o) => {
              if (o.isMesh && !mesh) mesh = o;
            });
            if (!mesh) return;
            // Bake the node transform so every copy attaches at the bone origin.
            const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
            geometry.userData.shared = true;
            const map = mesh.material.map || null;
            if (map) map.userData.shared = true;
            mesh.geometry.dispose();
            const outline = outlineMaterial(m.outline || '#40332c', 0.008);
            outline.userData.shared = true;
            loaded.set(`${group}/${id}`, { geometry, map, outline });
          })
          .catch((err) => console.warn('model not loaded:', m.file, err))
      );
    }
  }
  return Promise.all(jobs);
}

/** A prepared skinned character template (see skinned.js), or null until it has loaded. */
export function characterBase(id) {
  return loaded.get(`characters/${id}`) || null;
}

export function hasModel(group, id) {
  return loaded.has(`${group}/${id}`);
}

/**
 * A toon-shaded copy of a loaded model with its outline hull. `flash` is the rig material's
 * flash uniform, so the model flashes with the body.
 */
export function modelInstance(group, id, flash) {
  const m = loaded.get(`${group}/${id}`);
  if (!m) return null;
  const mat = new THREE.MeshToonMaterial({ map: m.map, gradientMap: toonRamp(), side: THREE.DoubleSide });
  mat.userData.rig = true; // freed with the rig; the shared texture is kept
  if (flash) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlash = flash;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFlash;')
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight = mix(outgoingLight, vec3(1.0), clamp(uFlash.x, 0.0, 1.0));
outgoingLight += vec3(1.0, 0.45, 0.15) * uFlash.y + vec3(0.5, 0.8, 1.0) * uFlash.z;
#include <opaque_fragment>`
        );
    };
    mat.customProgramCacheKey = () => 'model-toon';
  }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(m.geometry, mat);
  mesh.castShadow = true;
  g.add(mesh, new THREE.Mesh(m.geometry, m.outline));
  return g;
}
