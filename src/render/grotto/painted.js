// The grotto's props from the owner's sheets (docs/reference/grotto-*.png): Meshy's shapes, painted
// in vertex colours by scripts/blender/grotto-props.py into public/models/grotto/grotto-props.glb.
// Each prop is a few meshes named prop_<name>_<kind>; the kind says how it is drawn:
//   flat / smooth      cel-lit, faceted or smooth
//   shine / shinesm    cel-lit, faceted or smooth, giving off part of its own colour (crystals, pearls)
//   glow               unlit (flames, runes, the coral tree's tips)
// Metres; each prop stands on its own origin and faces +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonRamp, outlineMaterial } from '../toon.js';

const KINDS = ['flat', 'smooth', 'shine', 'shinesm', 'glow'];
const SHINE = 0.45; // how much of its own colour a shining piece gives off
const OUTLINE = { width: 0.012, color: '#2c2433' };
// outlines in a darker same hue, per prop
const EDGE = {
  crystal_s: '#1d2a66', crystal_m: '#1d2a66', crystal_l: '#1d2a66', pearl_shell: '#3a302c', coral_tree: '#3a2470',
  chest: '#3a2414', chest_open: '#3a2414', candles: '#3a3028', barrel: '#3a2414', crate: '#3a2414', post: '#3a2414',
  pillar: '#4a4636', pillar_broken: '#4a4636', pillar_fallen: '#4a4636', arch: '#4a4636', arch_shell: '#4a4636', arch_sealed: '#4a4636',
  pearl_altar: '#5a3e12',
};

/** Load the painted props. Resolves Map(name -> {parts: {kind: geometry}, height, radius}); rejects if the file is missing. */
export function loadPaintedProps(url = 'models/grotto/grotto-props.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const props = new Map();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const m = o.isMesh && /^prop_(\w+?)_(flat|smooth|shine|shinesm|glow)$/.exec(o.name);
        if (!m) return;
        let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (m[2] === 'flat' || m[2] === 'shine') {
          // faceted: every triangle its own corners, so each face is lit flat
          const indexed = g;
          g = indexed.toNonIndexed();
          indexed.dispose();
        }
        g.computeVertexNormals(); // the file has none
        g.computeBoundingBox();
        g.computeBoundingSphere();
        g.userData.shared = true; // kept for the page's life, like the kit
        if (!props.has(m[1])) props.set(m[1], { parts: {} });
        props.get(m[1]).parts[m[2]] = g;
        o.geometry.dispose();
        o.material?.dispose?.();
      });
      for (const p of props.values()) {
        const box = new THREE.Box3();
        for (const g of Object.values(p.parts)) box.union(g.boundingBox);
        p.height = box.max.y;
        p.radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
      }
      resolve(props);
    }, undefined, reject);
  });
}

let mats = null;
function materials() {
  if (mats) return mats;
  const toon = (shine) => {
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
    if (shine) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.selfGlow = { value: SHINE };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float selfGlow;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * selfGlow;');
      };
      m.customProgramCacheKey = () => 'glow-coral'; // the same program as the corals' (corals.js): the strength is a uniform
    }
    m.userData.shared = true;
    return m;
  };
  const lit = toon(false), shine = toon(true);
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }); // the runes and strands are single sheets
  glow.userData.shared = true;
  mats = { flat: lit, smooth: lit, shine, shinesm: shine, glow };
  return mats;
}

/** Many placements of one prop, instanced per piece (with an outline on the lit ones): list of {x, y, z, ry, s}. */
export function paintedInstances(props, name, list, { shadows = true } = {}) {
  const p = props.get(name), m = materials();
  const root = new THREE.Group();
  root.name = `painted-${name}`;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), at = new THREE.Vector3();
  const add = (geo, mat, lit) => {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((r, i) => {
      e.set(0, r.ry || 0, 0, 'YXZ');
      q.setFromEuler(e);
      m4.compose(at.set(r.x, r.y, r.z), q, s.setScalar(r.s ?? 1));
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = lit && shadows;
    inst.receiveShadow = lit;
    inst.computeBoundingSphere();
    root.add(inst);
  };
  for (const kind of KINDS) {
    const geo = p.parts[kind];
    if (!geo) continue;
    add(geo, m[kind], kind !== 'glow');
    if (kind !== 'glow') add(geo, outlineMaterial(EDGE[name] || OUTLINE.color, OUTLINE.width), false);
  }
  return root;
}
