// Local, opt-in art preview. The accepted GLB stays byte-for-byte unchanged.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toonRamp } from './toon.js';
import { clamp, toBoxLocal } from '../core/math.js';

export async function loadHarborV4(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

// Recover complete prop assemblies from the material-segmented export. Islands
// with intersecting XZ footprints belong together (legs, hoops, lids, foliage).
// Only rigid placement changes; every source triangle/normal/material is retained.
export function splitHarborProps(source) {
  const positions = [], triangles = [], meshes = [], vertexIds = new Map();
  const v = new THREE.Vector3();
  source.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const p = geometry.attributes.position, ids = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = v.toArray().map(n => Math.round(n * 10000)).join(',');
      if (!vertexIds.has(key)) { vertexIds.set(key, positions.length); positions.push(v.toArray()); }
      ids.push(vertexIds.get(key));
    }
    const index = geometry.index, count = index?.count ?? p.count, meshId = meshes.length;
    meshes.push({ geometry, material: mesh.material });
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
      triangles.push({ meshId, vertices, ids: vertices.map(id => ids[id]) });
    }
  });
  const parent = positions.map((_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (const t of triangles) for (const id of t.ids) parent[find(id)] = find(t.ids[0]);
  const islands = new Map();
  for (const t of triangles) {
    const id = find(t.ids[0]);
    if (!islands.has(id)) islands.set(id, { box: new THREE.Box3(), triangles: [] });
    const island = islands.get(id); island.triangles.push(t);
    for (const vertex of t.ids) island.box.expandByPoint(v.fromArray(positions[vertex]));
  }
  const assemblies = [];
  for (const island of islands.values()) {
    let joined = { box: island.box.clone(), triangles: [...island.triangles] };
    for (let i = 0; i < assemblies.length;) {
      const b = assemblies[i].box, a = joined.box, pad = .08;
      if (a.min.x <= b.max.x + pad && a.max.x >= b.min.x - pad && a.min.z <= b.max.z + pad && a.max.z >= b.min.z - pad) {
        joined.box.union(b); joined.triangles.push(...assemblies[i].triangles); assemblies.splice(i, 1); i = 0;
      } else i++;
    }
    assemblies.push(joined);
  }
  assemblies.sort((a, b) => a.box.min.x - b.box.min.x || a.box.min.z - b.box.min.z);
  const chunks = assemblies.map((assembly, id) => {
    const root = new THREE.Group(); root.name = `V4-prop-${id}`;
    root.userData.sourceBounds = { min: assembly.box.min.toArray(), max: assembly.box.max.toArray() };
    for (let meshId = 0; meshId < meshes.length; meshId++) {
      const selected = assembly.triangles.filter(t => t.meshId === meshId);
      if (!selected.length) continue;
      const { geometry, material } = meshes[meshId], compact = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geometry.attributes)) {
        const values = new attr.array.constructor(selected.length * 3 * attr.itemSize);
        let offset = 0;
        for (const t of selected) for (const vertex of t.vertices) for (let k = 0; k < attr.itemSize; k++) values[offset++] = attr.array[vertex * attr.itemSize + k];
        compact.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize, attr.normalized));
      }
      compact.computeBoundingBox(); compact.computeBoundingSphere();
      root.add(new THREE.Mesh(compact, material));
    }
    return root;
  });
  meshes.forEach(({ geometry }) => geometry.dispose());
  return chunks;
}

export function createHarborV4(source, config, world = null) {
  const root = new THREE.Group(); root.name = 'Harbor-V4-preview';
  const materials = new Map(), originals = new Set(), originalGeometry = new Set();
  const useMaterial = mesh => {
    if (!mesh.isMesh) return;
    const original = mesh.material;
    originals.add(original);
    if (!materials.has(original.name)) {
      const material = new THREE.MeshToonMaterial({ color: original.color.clone(), side: original.side, gradientMap: toonRamp() });
      material.name = original.name; material.userData.shared = true;
      materials.set(original.name, material);
    }
    mesh.material = materials.get(original.name); mesh.castShadow = true; mesh.receiveShadow = true;
  };
  for (const node of [...source.children]) {
    if (node.name === 'Props') {
      const chunks = splitHarborProps(node);
      node.traverse(o => { if (o.geometry) originalGeometry.add(o.geometry); if (o.material) originals.add(o.material); });
      chunks.forEach((chunk, i) => { chunk.position.fromArray(config.props[i].offset); chunk.traverse(useMaterial); root.add(chunk); });
    } else if (config.placements[node.name]) {
      const placement = new THREE.Group(); placement.name = `V4-${node.name}`;
      placement.position.fromArray(config.placements[node.name].offset);
      if (node.name === 'Pier' && world && config.fitPierApproach) {
        // The source approach is flat; the actual game has a shallow land ramp.
        // Fit this approach alone to the existing collision height. Main-deck
        // boards, piles, Boat and its attached rope keep their source shape.
        const ramp = world.docks.find(d => d.id === config.fitPierApproach);
        node.traverse(mesh => {
          if (!mesh.isMesh) return;
          originalGeometry.add(mesh.geometry);
          const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          const p = geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const local = toBoxLocal(ramp, p.getX(i) + placement.position.x, p.getZ(i) + placement.position.z);
            if (Math.abs(local.lx) <= ramp.hx + .5 && local.lz < ramp.hz) {
              const t = clamp((local.lz + ramp.hz) / (2 * ramp.hz), 0, 1);
              p.setY(i, p.getY(i) + ramp.startY + (ramp.height - ramp.startY) * t - ramp.height);
            }
          }
          geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          const fitted = new THREE.Mesh(geometry, mesh.material); useMaterial(fitted); placement.add(fitted);
        });
      } else { node.traverse(useMaterial); placement.add(node); }
      root.add(placement);
      if (['Pier', 'Boat', 'Quay'].includes(node.name)) placement.userData.waterContact = true;
    } else {
      node.traverse(o => { if (o.geometry) originalGeometry.add(o.geometry); if (o.material) originals.add(o.material); });
    }
  }
  originalGeometry.forEach(g => g.dispose()); originals.forEach(m => m.dispose());
  root.userData.preview = { sourceSha256: config.sha256, triangles: config.importedTriangles, logicalGroups: Object.keys(config.placements), propAssemblies: config.props.length };
  return root;
}
