// The grotto's cave rooms, modelled in Blender: scripts/blender/grotto-cave.py builds
// public/models/grotto/grotto-cave.glb from the map itself, so for every `style: "cave"` floor
// it holds that floor's old flagstones (`cavefloor_<id>`), the rock face around it (`cavewall_<id>`:
// tall and overhanging at the back, low at the front) and the boulders, stalactites and rubble on
// it (`caverock_<id>`), in world metres. Ambient occlusion is baked into the vertex colours; the
// cel material only lights them. The file has no normals (half the download): they are made here,
// a facet's own for the paving and rocks, smooth for the rock face.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gamePaint } from './game-paint.js';
import { outlineMaterial } from '../toon.js';

/** Load the cave model. Resolves {parts: Map(name -> geometry), source}; rejects if the file is missing. */
export function loadGrottoCave(url = 'models/grotto/grotto-cave.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const parts = new Map();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (!o.name.startsWith('cavewall_')) {
          // faceted: every triangle its own corners, so each face is lit flat
          const indexed = g;
          g = indexed.toNonIndexed();
          indexed.dispose();
        }
        g.computeVertexNormals();
        g.computeBoundingSphere();
        g.userData.shared = true; // kept for the page's life, like the kit
        parts.set(o.name, g);
        o.geometry.dispose();
        o.material?.dispose?.();
      });
      resolve({ parts, source: gltf.scene.userData.source });
    }, undefined, reject);
  });
}

/** The modelled cave rooms of `map`: the floor, wall and rock meshes of each cave floor the model
 * has, and the walls of every floor with `walls` (where it meets the void). */
export function buildCave(map, cave) {
  const root = new THREE.Group();
  root.name = 'cave';
  // painted stone (game-paint.js): the baked occlusion stays; the rock has its own dark cave tint
  const look = map.def.look, mat = gamePaint(look, 'cave'), cool = gamePaint(look, 'rock');
  for (const f of map.floors) {
    if (f.style !== 'cave' && !f.walls) continue;
    for (const kind of ['cavefloor', 'cavewall', 'caverock']) {
      const g = cave.parts.get(`${kind}_${f.id}`);
      if (!g) continue;
      const m = new THREE.Mesh(g, kind === 'cavefloor' ? mat : cool); // the floor is paving, the rest cave rock
      m.name = `${kind}-${f.id}`;
      m.receiveShadow = true;
      m.castShadow = kind !== 'cavefloor';
      root.add(m);
      // the game's stones carry a soft same-hue outline: a hull on welded, smooth normals so the
      // facets do not split it
      if (kind === 'caverock') {
        let hull = g.clone();
        hull.deleteAttribute('normal');
        for (const k of Object.keys(hull.attributes)) if (k !== 'position') hull.deleteAttribute(k);
        hull = mergeVertices(hull, 1e-3);
        hull.computeVertexNormals();
        const line = new THREE.Mesh(hull, outlineMaterial(look.paint?.ink || '#4a4652', 0.05));
        line.name = `caveline-${f.id}`;
        root.add(line);
      }
    }
  }
  return { root };
}
