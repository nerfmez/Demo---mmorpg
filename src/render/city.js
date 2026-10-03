// Approved V3: one common placement transform, lossless source geometry and native contours.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toon, darker, outlineMaterial } from './toon.js';
import { outlineStructure } from './architecture.js';
import { batchStatic } from './static-batch.js';

export async function loadCity(world) {
  const city = world.data.city;
  if (!city?.enabled) return null;
  const start = performance.now(), loader = new GLTFLoader();
  const root = new THREE.Group(); root.name = 'approved-v3-city';
  root.position.fromArray(city.offset);
  const files = await Promise.all(city.files.map(async file => {
    const gltf = await loader.loadAsync(new URL(file.url, new URL(import.meta.env.BASE_URL, location.href)).href);
    return { file, scene: gltf.scene };
  }));
  const originals = new Set(), materials = new Map();
  let meshes = 0;
  for (const { file, scene } of files) {
    scene.name = file.file;
    const solids = [];
    scene.traverse(o => { if (o.isMesh) solids.push(o); });
    for (const mesh of solids) {
      meshes++;
      const old = mesh.material; originals.add(old);
      const key = `${old.color.getHex()}/${old.emissive?.getHex() || 0}`;
      if (!materials.has(key)) {
        const m = toon('#' + old.color.getHexString()).clone();
        m.color.copy(old.color); m.userData.shared = true;
        if (old.emissive) m.emissive.copy(old.emissive);
        materials.set(key, m);
      }
      mesh.material = materials.get(key);
      mesh.castShadow = !['01_Ground.glb', '02_Roads.glb', '03_Quays.glb'].includes(file.file);
      mesh.receiveShadow = true;
      if (['04_Walls.glb', '05_Residential.glb', '06_Civic.glb', '07_Warehouses.glb', '08_Shipyard.glb', '09_Landmarks.glb', '11_Props.glb'].includes(file.file)) {
        const parent = mesh.parent, wrapper = new THREE.Group();
        wrapper.userData.mesh = mesh; parent.add(wrapper); wrapper.add(mesh);
        const hull = new THREE.Mesh(mesh.geometry, outlineMaterial(darker('#' + mesh.material.color.getHexString(), .35), .015));
        hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
        wrapper.add(hull);
      }
    }
    if (!['01_Ground.glb', '02_Roads.glb'].includes(file.file)) outlineStructure(scene);
    root.add(scene);
  }
  for (const material of originals) material.dispose();
  const batch = batchStatic(root, { cell: 24 });
  return { root, stats: { readyMs: performance.now() - start, sourceMeshDraws: meshes, batch, assetBytes: city.files.reduce((n, f) => n + f.bytes, 0), sourceTriangles: city.files.reduce((n, f) => n + f.placedTriangles, 0) } };
}
