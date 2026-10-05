// Imported GLB models (data/models.json). Weapons load once on demand and
// replace a gear base's procedural shape; until then (or if loading fails) the procedural
// shape is used. Geometry and textures are shared by every copy; each rig gets its own
// toon material so hit flashes still reach the weapon.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toonRamp, outlineMaterial } from './toon.js';
import { prepareHeroBase } from './skinned.js';
import { prepareVrmBody, useVrm } from './vrm-body.js';
import { prepareMonsterModel } from './monsterSkin.js';

const loaded = new Map(); // "weapons/rusty_sword" -> {parts, outline}
const loading = new Map(); // deduplicate concurrent/repeated registry loads
const weapons = new Map();
const failedWeapons = new Set();
const weaponListeners = new Set();
const loader = new GLTFLoader();

/** Register lazy weapons; load character/monster templates at boot as before. */
export function loadModels(registry = {}, { onWeaponReady } = {}) {
  if (onWeaponReady) weaponListeners.add(onWeaponReady);
  const jobs = [];
  for (const [group, entries] of Object.entries(registry)) {
    if (group.startsWith('_')) continue;
    for (const [id, m] of Object.entries(entries)) {
      if (group === 'weapons') { weapons.set(id, m); continue; }
      if (m.vrm && !useVrm) continue; // the VRM hero is opt-in (?hero=vrm), so it is not downloaded otherwise
      const key = `${group}/${id}`;
      if (loaded.has(key)) continue;
      if (loading.has(key)) { jobs.push(loading.get(key)); continue; }
      const job = loader
          .loadAsync(m.file)
          .then((gltf) => {
            if (group === 'characters' || group === 'monsters') {
              loaded.set(`${group}/${id}`, (m.hairsample || m.vrm ? prepareVrmBody : group === 'characters' ? prepareHeroBase : prepareMonsterModel)(gltf, m));
              return;
            }
            loaded.set(`${group}/${id}`, prepareWeaponModel(gltf.scene, m));
          })
          .catch((err) => console.warn('model not loaded:', m.file, err))
          .finally(() => loading.delete(key));
      loading.set(key, job);
      jobs.push(job);
    }
  }
  return Promise.all(jobs);
}

/** Demand is keyed by item ID; completion caches a template, never an old hand/rig. */
function requestWeapon(id) {
  const metadata = weapons.get(id), key = `weapons/${id}`;
  if (!metadata || loaded.has(key) || failedWeapons.has(id)) return;
  if (loading.has(key)) return loading.get(key);
  const job = loader.loadAsync(metadata.file).then((gltf) => {
    loaded.set(key, prepareWeaponModel(gltf.scene, metadata));
    for (const listener of weaponListeners) listener(id);
  }).catch((err) => {
    failedWeapons.add(id); // fallback stays visible; equips do not repeatedly retry a bad URL
    console.warn('model not loaded:', metadata.file, err);
  }).finally(() => loading.delete(key));
  loading.set(key, job);
  return job;
}

/** Only the current hands affect this readiness key, so stale requests cannot refresh new gear. */
export function weaponModelKey(bases = {}) {
  return `${loaded.has(`weapons/${bases.weapon}`)}:${loaded.has(`weapons/${bases.offhand}`)}`;
}

/** Portraits may wait for current demanded assets; absent/failed assets use fallback. */
export function weaponModelsReady(bases = {}) {
  let ready = true;
  for (const id of [bases.weapon, bases.offhand]) {
    if (weapons.has(id) && !loaded.has(`weapons/${id}`) && !failedWeapons.has(id)) {
      requestWeapon(id); ready = false;
    }
  }
  return ready;
}

/** A prepared monster model template (see monsterSkin.js), or null until it has loaded. */
export function monsterModel(type) {
  return loaded.get(`monsters/${type}`) || null;
}

/** A prepared skinned character template (see skinned.js), or null until it has loaded. */
export function characterBase(id) {
  return loaded.get(`characters/${id}`) || null;
}

export function hasModel(group, id) {
  if (group === 'weapons' && !loaded.has(`weapons/${id}`)) requestWeapon(id);
  return loaded.has(`${group}/${id}`);
}

/**
 * A toon-shaded copy of a loaded model with its outline hull. `flash` is the rig material's
 * flash uniform, so the model flashes with the body.
 */
export function modelInstance(group, id, flash) {
  const m = loaded.get(`${group}/${id}`);
  if (!m) return null;
  const g = new THREE.Group();
  // Seat a specified source point in the palm without changing cached geometry.
  g.position.fromArray(m.attachmentGrip).negate();
  g.userData.attachmentGrip = m.attachmentGrip;
  const materials = new Map(); // one rig material per source material, shared by its parts
  for (const part of m.parts) {
    const materialFor = (source) => {
      if (materials.has(source)) return materials.get(source);
      const mat = new THREE.MeshToonMaterial(source);
      mat.userData.rig = true; // rig owns material; cached template owns geometry/textures
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
      materials.set(source, mat);
      return mat;
    };
    const mat = Array.isArray(part.material) ? part.material.map(materialFor) : materialFor(part.material);
    const mesh = new THREE.Mesh(part.geometry, mat);
    mesh.castShadow = true;
    g.add(mesh);
    // Transparent/cutout materials do not get an opaque hull over their holes.
    const sources = Array.isArray(part.material) ? part.material : [part.material];
    if (sources.every((s) => !s.transparent && !s.alphaTest)) g.add(new THREE.Mesh(part.geometry, m.outline));
  }
  return g;
}

/** Cache all exported parts in the authored grip frame; no recentering or simplification. */
export function prepareWeaponModel(scene, metadata = {}) {
  scene.updateMatrixWorld(true);
  const parts = [], materials = new Map(), geometries = new Set(), sourceMaterials = new Set(), keptTextures = new Set(), sourceTextures = new Set();
  const materialFor = (source) => {
    if (materials.has(source)) return materials.get(source);
    const result = {
      color: source.color?.clone() ?? new THREE.Color(0xffffff),
      map: source.map || null, alphaMap: source.alphaMap || null,
      gradientMap: toonRamp(), side: source.side,
      transparent: source.transparent, opacity: source.opacity,
      alphaTest: source.alphaTest, depthWrite: source.depthWrite,
      vertexColors: source.vertexColors,
      emissive: source.emissive?.clone() ?? new THREE.Color(0),
      emissiveMap: source.emissiveMap || null, emissiveIntensity: source.emissiveIntensity ?? 1,
      normalMap: source.normalMap || null, normalScale: source.normalScale?.clone(),
    };
    for (const value of Object.values(result)) if (value?.isTexture) { value.userData.shared = true; keptTextures.add(value); }
    for (const value of Object.values(source)) if (value?.isTexture) sourceTextures.add(value);
    sourceMaterials.add(source); materials.set(source, result);
    return result;
  };
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.userData.shared = true;
    const material = Array.isArray(mesh.material) ? mesh.material.map(materialFor) : materialFor(mesh.material);
    parts.push({ geometry, material }); geometries.add(mesh.geometry);
  });
  if (!parts.length) throw new Error('weapon GLB contains no meshes');
  for (const geometry of geometries) geometry.dispose();
  for (const material of sourceMaterials) material.dispose();
  // PBR-only maps are not sampled by the game's toon material; release their loader resources.
  for (const texture of sourceTextures) if (!keptTextures.has(texture)) { texture.dispose(); texture.source?.data?.close?.(); }
  const outline = outlineMaterial(metadata.outline || '#40332c', metadata.outlineWidth ?? 0.008);
  outline.userData.shared = true;
  return { parts, outline, attachmentGrip: [...(metadata.attachmentGrip || [0, 0, 0])] };
}
