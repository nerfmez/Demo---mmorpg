// The grotto's six glowing corals (reference: docs/reference/glow-corals.png). Their shapes are
// Meshy's (image-to-3D of the whole sheet at once, assets/meshy/grotto/glow_corals_meshy.glb); their
// colour is painted into vertex colours by scripts/blender/grotto-corals.py, which writes
// public/models/grotto/glow-corals.glb: for each coral a cel-lit body and what glows on it (the
// bulbs at the branch tips and the specks along it), drawn unlit so it shines in the dark.
// Metres; each coral stands on its own origin and faces +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonRamp, outlineMaterial } from '../toon.js';

/** The corals of the sheet, with the outline (a darker same hue) and the halo colour each gets. */
export const GLOW_CORALS = {
  purple: { outline: '#2c1a5c', halo: '#c07cff' },
  blue: { outline: '#132e6a', halo: '#5fc8ff' },
  teal: { outline: '#124848', halo: '#6ff0dc' },
  tubes: { outline: '#1c1e5a', halo: '#6f8cff' },
  bubbles: { outline: '#2e1a4c', halo: '#9a7cff' },
  pink: { outline: '#5a1f55', halo: '#ff8ae0' },
};

/** Load the painted corals. Resolves Map(name -> {body, glow, height}); rejects if the file is missing. */
export function loadGlowCorals(url = 'models/grotto/glow-corals.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const corals = new Map();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const m = o.isMesh && /^coral_(\w+)_(body|glow)$/.exec(o.name);
        if (!m) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        g.computeVertexNormals(); // the file has none: smooth, made here
        g.computeBoundingBox();
        g.computeBoundingSphere();
        g.userData.shared = true; // kept for the page's life, like the kit
        if (!corals.has(m[1])) corals.set(m[1], {});
        corals.get(m[1])[m[2]] = g;
        o.geometry.dispose();
        o.material?.dispose?.();
      });
      for (const c of corals.values()) c.height = c.body.boundingBox.max.y;
      resolve(corals);
    }, undefined, reject);
  });
}

const SELF_GLOW = 0.5; // how much of its own colour a coral body gives off (the sheet's corals glow all over)
const BULB = '#d0d0d0'; // the bulbs and specks, dimmed a little: the page's bloom does the rest

let mats = null;
function materials() {
  if (!mats) {
    const body = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
    body.onBeforeCompile = (shader) => {
      shader.uniforms.selfGlow = { value: SELF_GLOW };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float selfGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * selfGlow;');
    };
    body.customProgramCacheKey = () => 'glow-coral'; // the strength is a uniform: one program
    mats = { body, glow: new THREE.MeshBasicMaterial({ vertexColors: true, color: BULB }) };
    mats.body.userData.shared = true;
    mats.glow.userData.shared = true;
  }
  return mats;
}

/** One coral as a Group (body + outline + glow); `corals` is loadGlowCorals()'s result. */
export function buildGlowCoral(corals, name) {
  const c = corals.get(name), m = materials();
  const root = new THREE.Group();
  root.name = `coral-${name}`;
  const body = new THREE.Mesh(c.body, m.body);
  body.receiveShadow = true; // glowing corals light themselves; their shadows would double the coral cost
  root.add(body, new THREE.Mesh(c.body, outlineMaterial(GLOW_CORALS[name].outline, 0.01)));
  if (c.glow) root.add(new THREE.Mesh(c.glow, m.glow));
  return root;
}

/** Many placements of one coral, instanced (body, outline, glow): list of {x, y, z, ry, s}. */
export function glowCoralInstances(corals, name, list) {
  const c = corals.get(name), m = materials();
  const root = new THREE.Group();
  root.name = `corals-${name}`;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const parts = [[c.body, m.body], [c.body, outlineMaterial(GLOW_CORALS[name].outline, 0.01)], [c.glow, m.glow]];
  for (const [geo, mat] of parts) {
    if (!geo) continue;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((r, i) => {
      e.set(0, r.ry || 0, 0, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p.set(r.x, r.y, r.z), q, s.setScalar(r.s ?? 1));
      inst.setMatrixAt(i, m4);
    });
    inst.receiveShadow = mat === m.body;
    inst.computeBoundingSphere();
    root.add(inst);
  }
  return root;
}
