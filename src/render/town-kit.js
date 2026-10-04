// Outpost kit: a non-city town (data town.kit) borrows single buildings and stalls from
// the approved city kit files, so it shares the city's look (palette, open-sheet sides,
// black feature contours). Each world box with a `kit` node name is drawn by that node;
// its collider stays the data box. Loaded once, then merged by the static-cell batcher.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { outlineStructure } from './architecture.js';
import { importedMaterial } from './city-palette.js';
import { batchStatic } from './static-batch.js';

const box = new THREE.Box3(), centre = new THREE.Vector3();

export async function loadTownKit(world) {
  const kit = world.data.town?.kit;
  const placed = world.boxes.filter((b) => b.kit);
  if (!kit || !placed.length) return null;
  const start = performance.now(), loader = new GLTFLoader();
  const files = [...new Set(placed.map((b) => kit.nodes[b.kit]?.file))];
  if (files.includes(undefined)) throw new Error('Town kit node without a file');
  const scenes = new Map(await Promise.all(files.map(async (file) => {
    const gltf = await loader.loadAsync(new URL(kit.base + file, new URL(import.meta.env.BASE_URL, location.href)).href);
    return [file, gltf.scene];
  })));
  const root = new THREE.Group();
  root.name = 'town-kit';
  const materials = new Map(), originals = new Set();
  for (const b of placed) {
    const source = scenes.get(kit.nodes[b.kit].file).getObjectByName(b.kit);
    if (!source) throw new Error('Missing town kit node: ' + b.kit);
    // A node is used once; its city placement is replaced by the data box.
    source.removeFromParent();
    source.position.set(0, 0, 0);
    source.quaternion.identity();
    source.updateMatrixWorld(true);
    box.setFromObject(source).getCenter(centre);
    const holder = new THREE.Group();
    holder.name = b.id || b.kit;
    holder.userData.cityBlackContours = true;
    source.position.set(-centre.x, -box.min.y, -centre.z);
    holder.add(source);
    holder.position.set(b.x, world.groundY(b.x, b.z) - (kit.sink ?? 0.05), b.z);
    holder.rotation.y = b.angle + (kit.nodes[b.kit].yaw || 0);
    source.traverse((o) => {
      if (!o.isMesh) return;
      originals.add(o.material);
      o.material = importedMaterial(kit, o.material, o, materials);
      o.castShadow = true;
      o.receiveShadow = true;
    });
    outlineStructure(holder);
    root.add(holder);
  }
  for (const m of originals) m.dispose();
  // Unused nodes of the kit files are never added to the scene; free their buffers
  // unless a placed node shares the same geometry.
  const used = new Set();
  root.traverse((o) => o.isMesh && used.add(o.geometry));
  for (const scene of scenes.values()) scene.traverse((o) => o.isMesh && !used.has(o.geometry) && o.geometry.dispose());
  const batch = batchStatic(root, { cell: 24 });
  return { root, stats: { readyMs: performance.now() - start, kitNodes: placed.length, batch } };
}
