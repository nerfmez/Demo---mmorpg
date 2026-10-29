// The giant clam that keeps a pearl (reference: docs/reference/giant-clam-pearl.png). Its shape is
// Meshy's (image-to-3D from that picture, assets/meshy/grotto/giant_clam_meshy.glb); its colour is
// painted into vertex colours by scripts/blender/grotto-clam.py, which writes
// public/models/grotto/giant-clam.glb: clam_lid, clam_cup (with the flesh) and clam_pearl.
// Here each piece gets the game's cel material and a soft outline; the pearl glows a little.
// Metres; the gape faces +Z; it rests on y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonRamp, outlineMaterial } from '../toon.js';

const WIDTH = 1.85; // across the shell, metres, at prop scale 1

/** Load the painted clam. Resolves {lid, cup, pearl} geometries; rejects if the file is missing. */
export function loadGiantClam(url = 'models/grotto/giant-clam.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const parts = {};
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      // centred on x/z, resting on y = 0, scaled to WIDTH across
      const k = WIDTH / size.x;
      const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(fit);
        g.computeVertexNormals();
        g.computeBoundingSphere();
        g.userData.shared = true; // kept for the page's life, like the kit
        parts[o.name.replace('clam_', '')] = g;
        o.geometry.dispose();
        o.material?.dispose?.();
      });
      resolve(parts);
    }, undefined, reject);
  });
}

let mats = null;
function materials() {
  if (!mats) {
    mats = {
      shell: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }),
      pearl: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: new THREE.Color('#b9a8e8'), emissiveIntensity: 0.2 }),
      edge: outlineMaterial('#3a3046', 0.008),
    };
    mats.shell.userData.shared = true;
    mats.pearl.userData.shared = true;
  }
  return mats;
}

/** The clam as a Group with userData.nodes {cup, lid, pearl}; `model` is loadGiantClam()'s result. */
export function buildGiantClam(model) {
  const m = materials();
  const root = new THREE.Group();
  root.name = 'giant-clam';
  const nodes = {};
  for (const name of ['cup', 'lid', 'pearl']) {
    const g = new THREE.Group();
    g.name = name;
    const body = new THREE.Mesh(model[name], name === 'pearl' ? m.pearl : m.shell);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body, new THREE.Mesh(model[name], m.edge));
    root.add(g);
    nodes[name] = g;
  }
  root.userData.nodes = nodes;
  return root;
}
