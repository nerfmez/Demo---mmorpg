// The grotto's monsters from the owner's sheet (docs/reference/grotto-pearl-fish.png,
// grotto-pearl-slug.png, grotto-eye-clam.png): Meshy's shapes (image-to-3D, smart topology, one each)
// with Meshy's textures (Meshy 6 retexture from the same picture). scripts/blender/grotto-monsters.py
// cuts them into the parts the game moves and writes public/models/grotto/grotto-monsters.glb as
// mon_<monster>_<part>, every part of a monster sharing its texture. Here each part gets the game's
// cel shading over that texture and a same-hue outline, and the parts that move on their own hang
// from their own pivot: the fish's tail and side fins, the slug's plumes, the clam's eye.
// Metres; each monster stands on its own origin and faces +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonRamp, outlineMaterial } from '../toon.js';

/** The monsters, with the outline (a darker same hue) each gets. */
export const GROTTO_MONSTERS = {
  fish: { outline: '#3c3a72' },
  slug: { outline: '#17505c' },
  clam: { outline: '#4a2c3e' },
};
// how much of its own colour each part gives off: a little for every part, so the monsters read in
// the dark of the cave the way the corals do, more for the pearls
const SELF_LIGHT = 0.2, PEARL_LIGHT = 0.45;
const WIDTH = 0.012;

/** Load the monsters. Resolves Map(name -> {parts: {part: {geometry, glow}}, map, height}); rejects if the file is missing. */
export function loadGrottoMonsters(url = 'models/grotto/grotto-monsters.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const out = new Map();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const m = o.isMesh && /^mon_([a-z]+)_([a-z]+)$/.exec(o.name);
        if (!m) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld); // keeps the file's smooth normals across the texture's seams
        g.computeBoundingBox();
        g.computeBoundingSphere();
        g.userData.shared = true; // kept for the page's life, like the kit
        if (!out.has(m[1])) out.set(m[1], { parts: {}, map: null });
        const mon = out.get(m[1]);
        mon.parts[m[2]] = { geometry: g, glow: m[2] === 'pearls' ? PEARL_LIGHT : SELF_LIGHT };
        if (o.material?.map && !mon.map) {
          mon.map = o.material.map;
          mon.map.userData.shared = true;
        }
        o.geometry.dispose();
      });
      for (const mon of out.values()) {
        const box = new THREE.Box3();
        for (const p of Object.values(mon.parts)) box.union(p.geometry.boundingBox);
        mon.height = box.max.y;
      }
      resolve(out);
    }, undefined, reject);
  });
}

const mats = new Map(); // `${monster}|${glow}` -> material
function material(name, map, glow) {
  const key = `${name}|${glow}`;
  if (mats.has(key)) return mats.get(key);
  const m = new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.selfGlow = { value: glow };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float selfGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * selfGlow;');
  };
  m.customProgramCacheKey = () => 'glow-coral'; // one program for every monster: the texture and the strength are uniforms
  m.userData.shared = true;
  mats.set(key, m);
  return m;
}

const sideFin = (b) => [Math.abs(b.min.x) < Math.abs(b.max.x) ? b.min.x : b.max.x, b.max.y, (b.min.z + b.max.z) / 2]; // its top edge, against the body
// where each moving part hangs from, from its own box: the tail at its front edge, a side fin at
// the edge against the body, the plumes at their foot, the eye at its middle
const PIVOT = {
  fish: { tail: (b) => [0, (b.min.y + b.max.y) / 2, b.max.z], finl: (b) => sideFin(b), finr: (b) => sideFin(b) },
  slug: { cerata: (b) => [(b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2] },
  clam: { eye: (b) => [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2] },
};

/** One monster as a Group with userData.nodes {part: Group}; each moving part's group sits at its pivot. */
export function buildMonster(monsters, name) {
  const mon = monsters.get(name), edge = outlineMaterial(GROTTO_MONSTERS[name].outline, WIDTH);
  const root = new THREE.Group();
  root.name = `monster-${name}`;
  const nodes = {};
  for (const [part, { geometry, glow }] of Object.entries(mon.parts)) {
    const node = new THREE.Group();
    node.name = part;
    const pivot = PIVOT[name]?.[part]?.(geometry.boundingBox) || [0, 0, 0];
    node.position.set(...pivot);
    for (const mat of [material(name, mon.map, glow), edge]) {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(-pivot[0], -pivot[1], -pivot[2]);
      mesh.castShadow = mat !== edge;
      mesh.receiveShadow = mat !== edge;
      node.add(mesh);
    }
    root.add(node);
    nodes[part] = node;
  }
  root.userData.nodes = nodes;
  return root;
}

/**
 * The idle motion of a monster built by buildMonster (cosmetic only: no rules move it): the fish
 * beats its tail and fins and bobs, the slug crawls in place (a slow stretch and squash) with its
 * plumes swaying, the clam breathes and its eye looks around, now and then darting.
 */
export function idleMonster(group, name, t, phase = 0) {
  const n = group.userData.nodes, k = t + phase;
  if (name === 'fish') {
    n.tail.rotation.y = Math.sin(k * 5.2) * 0.42;
    n.finl.rotation.z = -0.15 + Math.sin(k * 3.1) * 0.35;
    n.finr.rotation.z = 0.15 - Math.sin(k * 3.1) * 0.35;
    n.body.rotation.y = -Math.sin(k * 5.2) * 0.05;
  } else if (name === 'slug') {
    const s = Math.sin(k * 1.7);
    group.scale.set(1 - s * 0.02, 1 - s * 0.04, 1 + s * 0.05);
    n.cerata.rotation.x = Math.sin(k * 1.3) * 0.06;
    n.cerata.rotation.z = Math.sin(k * 0.9 + 1) * 0.05;
  } else if (name === 'clam') {
    const s = Math.sin(k * 1.1);
    n.shell.scale.set(1 + s * 0.012, 1 + s * 0.025, 1 + s * 0.012);
    // it looks one way, then another, with a quick dart between
    const look = Math.floor(k / 2.3), f = Math.min(1, ((k / 2.3) % 1) * 6), h = (a) => { const x = Math.sin(a * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5; };
    n.eye.rotation.y = THREE.MathUtils.lerp(h(look - 1), h(look), f) * 0.9;
    n.eye.rotation.x = THREE.MathUtils.lerp(h(look + 9), h(look + 10), f) * 0.4;
  }
}
