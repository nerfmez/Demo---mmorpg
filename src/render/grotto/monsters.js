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
  boss: { outline: '#3e1c26' }, // the Pearl Snail King, out of its shell
  bossshell: { outline: '#2c2a36' }, // the same, hidden in its shell
};
/**
 * The forest's monsters from the owner's second sheet (docs/reference/forest-monster-sheet.png),
 * made the same way (scripts/blender/forest-monsters.py, public/models/forest/forest-monsters.glb).
 * They live in daylight: no light of their own.
 */
export const FOREST_MONSTERS = {
  pangolin: { outline: '#4a3e2a', light: 0 }, // the stone pangolin
  fox: { outline: '#5c2014', light: 0 }, // the leaf fox
  tanuki: { outline: '#3a2818', light: 0 }, // the leaf tanuki
};
const LOOK = { ...GROTTO_MONSTERS, ...FOREST_MONSTERS };
// how much of its own colour each part gives off: a little for every part, so the monsters read in
// the dark of the cave the way the corals do, more for the pearls
const SELF_LIGHT = 0.2, PEARL_LIGHT = 0.45, BOSS_PEARL_LIGHT = 0.3; // the boss's great pearl is golden: more would wash it white
// the boss is big enough to read on its own: much less, or the white barnacles on its shell bloom into glowing spots
const BOSS_LIGHT = 0.06;
const WIDTH = 0.012;

/** Load a monster file (the grotto's by default). Resolves Map(name -> {parts: {part: {geometry, glow}}, map, height}); rejects if the file is missing. */
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
        const own = m[2] === 'pearls' ? PEARL_LIGHT : m[2] === 'pearl' ? BOSS_PEARL_LIGHT : m[1].startsWith('boss') ? BOSS_LIGHT : SELF_LIGHT;
        mon.parts[m[2]] = { geometry: g, glow: LOOK[m[1]]?.light ?? own };
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

const middle = (b) => [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
const sideFin = (b) => [Math.abs(b.min.x) < Math.abs(b.max.x) ? b.min.x : b.max.x, b.max.y, (b.min.z + b.max.z) / 2]; // its top edge, against the body
// where each moving part hangs from, from its own box: the tail at its front edge, a side fin at
// the edge against the body, the plumes at their foot, the eye at its middle
const PIVOT = {
  fish: { tail: (b) => [0, (b.min.y + b.max.y) / 2, b.max.z], finl: (b) => sideFin(b), finr: (b) => sideFin(b) },
  slug: { cerata: (b) => [(b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2] },
  clam: { eye: (b) => middle(b) },
  boss: { eyel: (b) => middle(b), eyer: (b) => middle(b), pearl: (b) => middle(b) },
  bossshell: { pearl: (b) => middle(b) },
  fox: { tail: (b) => [b.min.x, b.min.y, b.max.z] }, // the tail's root, against the fox's rump
};

/** One monster as a Group with userData.nodes {part: Group}; each moving part's group sits at its pivot. */
export function buildMonster(monsters, name) {
  const mon = monsters.get(name), edge = outlineMaterial(LOOK[name].outline, WIDTH);
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
  if (name === 'clam') { group.position.y = 0; group.rotation.x = 0; group.scale.setScalar(1); }
  if (name === 'fish') {
    n.tail.rotation.y = Math.sin(k * 5.2) * 0.42;
    n.finl.rotation.z = -0.15 + Math.sin(k * 3.1) * 0.35;
    n.finr.rotation.z = 0.15 - Math.sin(k * 3.1) * 0.35;
    n.body.rotation.y = -Math.sin(k * 5.2) * 0.05;
  } else if (name === 'slug') {
    const s = Math.sin(k * 1.7);
    group.scale.set(1 - s * 0.02, 1 - s * 0.04, 1 + s * 0.05);
    n.body.position.y = 0;
    n.cerata.rotation.x = Math.sin(k * 1.3) * 0.06;
    n.cerata.rotation.z = Math.sin(k * 0.9 + 1) * 0.05;
  } else if (name === 'clam') {
    const s = Math.sin(k * 1.1);
    n.shell.scale.set(1 + s * 0.012, 1 + s * 0.025, 1 + s * 0.012);
    // it looks one way, then another, with a quick dart between
    const look = Math.floor(k / 2.3), f = Math.min(1, ((k / 2.3) % 1) * 6), h = (a) => { const x = Math.sin(a * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5; };
    n.eye.rotation.y = THREE.MathUtils.lerp(h(look - 1), h(look), f) * 0.9;
    n.eye.rotation.x = THREE.MathUtils.lerp(h(look + 9), h(look + 10), f) * 0.4;
  } else if (name === 'boss') {
    // the king breathes slowly, its great pearl swelling a little with it, and its stalked eyes
    // look about together, now and then darting
    const s = Math.sin(k * 0.8);
    n.body.scale.set(1 + s * 0.008, 1 + s * 0.018, 1 + s * 0.008);
    n.pearl.scale.setScalar(1 + Math.max(0, Math.sin(k * 0.8 + 0.6)) * 0.04);
    const look = Math.floor(k / 3.1), f = Math.min(1, ((k / 3.1) % 1) * 5), h = (a) => { const x = Math.sin(a * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };
    for (const eye of [n.eyel, n.eyer]) {
      eye.rotation.y = THREE.MathUtils.lerp(h(look - 1), h(look), f) * 1.1;
      eye.rotation.x = THREE.MathUtils.lerp(h(look + 5), h(look + 6), f) * 0.5;
    }
  } else if (name === 'bossshell') {
    n.shell.rotation.z = Math.sin(k * 0.7) * 0.012; // it sits nearly still, rocking a hair
  } else if (name === 'pangolin') {
    // its plates rise and settle with a slow, heavy breath
    const s = Math.sin(k * 0.9);
    n.body.scale.set(1 + s * 0.01, 1 + s * 0.022, 1);
  } else if (name === 'fox') {
    // it breathes quickly, and the leaves of its tail sway like a branch in the wind
    const s = Math.sin(k * 2.4);
    n.body.scale.set(1 + s * 0.006, 1 + s * 0.012, 1);
    n.tail.rotation.y = Math.sin(k * 1.3) * 0.09;
    n.tail.rotation.x = Math.sin(k * 1.9 + 0.7) * 0.04;
  } else if (name === 'tanuki') {
    // it breathes and bobs on its paws, ready to pounce
    const s = Math.sin(k * 1.8);
    n.body.scale.set(1 + s * 0.012, 1 + s * 0.02, 1 + s * 0.008);
    n.body.position.y = Math.max(0, Math.sin(k * 3.6)) * 0.025;
  }
}

/**
 * A monster's walk, driven by its walker from src/core/dungeon-monsters.js (true when it walked):
 * the slug crawls, its body rippling in waves front to back with how far it has gone and its plumes
 * swaying; the clam leaps along (owner, 30 October 2026: "หอยขอเป็นกระโดด"), crouching before each hop,
 * stretching up as it leaves the ground, tipping forward in the air and squashing as it lands, its eye
 * fixed ahead; the boss heaves itself along, its body surging and settling with each pull and its
 * stalked eyes bobbing forward. `s` is the monster's own scale (the group's scale is set here).
 */
export function walkMonster(group, name, walker, t, phase = 0, s = 1) {
  const n = group.userData.nodes;
  if (name === 'slug') {
    const k = walker.travelled * 5.5 + phase;
    group.scale.set(s * (1 - Math.sin(k) * 0.03), s * (1 - Math.sin(k) * 0.07), s * (1 + Math.sin(k) * 0.1));
    n.body.position.y = Math.max(0, Math.sin(k + 1.2)) * 0.03;
    n.cerata.rotation.x = Math.sin(k + 1.4) * 0.14;
    n.cerata.rotation.z = Math.sin(t * 1.3 + phase) * 0.05;
    return true;
  }
  if (name === 'clam') {
    const w = walker.walk, ph = walker.gaitT % w.every;
    let sy = 1, sxz = 1, lift = 0, tip = 0;
    if (walker.air >= 0) {
      const a = walker.air;
      lift = Math.sin(a * Math.PI) * 0.75; // up and down in one arc
      sy = 1 + Math.sin(Math.min(1, a * 2) * Math.PI) * 0.16; // stretched as it leaves the ground
      tip = Math.sin(a * Math.PI) * 0.22; // leaning into the leap
    } else {
      const g = (ph - w.air) / (w.every - w.air); // on the ground between hops: land, then crouch
      const land = Math.max(0, 1 - g * 3), crouch = Math.max(0, (g - 0.55) / 0.45);
      sy = 1 - land * 0.22 - Math.sin(crouch * Math.PI * 0.5) * 0.2;
    }
    sxz = 1 + (1 - sy) * 0.5;
    group.scale.set(s * sxz, s * sy, s * sxz);
    group.position.y = lift;
    group.rotation.x = tip;
    n.shell.scale.setScalar(1);
    n.eye.rotation.set(-tip * 0.5, 0, 0); // it keeps its eye on where it is going
    return true;
  }
  if (name === 'boss') {
    const k = walker.travelled * 2.2 + phase;
    const pull = Math.sin(k);
    group.scale.set(s * (1 - pull * 0.02), s * (1 - pull * 0.035), s * (1 + pull * 0.05));
    n.body.rotation.x = -Math.max(0, pull) * 0.03;
    for (const eye of [n.eyel, n.eyer]) {
      eye.rotation.x = -0.15 + Math.sin(k + 0.8) * 0.12;
      eye.rotation.y = Math.sin(t * 0.7 + phase) * 0.15;
    }
    n.pearl.scale.setScalar(1);
    return true;
  }
  return false;
}

const hash = (a) => { const x = Math.sin(a * 91.345) * 43758.5453; return x - Math.floor(x); };

/**
 * A pearl fish stranded on its side, flopping (owner, 30 October 2026). `fish` is buildMonster's
 * fish; the returned holder lays it on its left side (its right fin up) on the holder's origin.
 * Every 1.1-2.1 s it flops: a quick hop with its body arched and its tail slapping down, a roll and
 * a small turn; between flops it lies gasping, the tail twitching and the fins fluttering.
 * Walking (src/core/dungeon-monsters.js, a `hop` gait) it flops along instead: update(t, air) with the
 * hop's progress air 0..1 (or -1 between hops) arches it and slaps its tail once per hop, alternating sides.
 * Returns {root, update(t, air)}; place and turn the root's parent, the root's own yaw is the resting flop's turn.
 */
export function strandedFish(fish, phase = 0) {
  const root = new THREE.Group(), lie = new THREE.Group();
  root.name = 'stranded-fish';
  // on its side: its height (y 0..0.92) lies along -x, centred; its width (±0.25) stands up
  lie.rotation.z = Math.PI / 2;
  fish.position.set(0, 0, 0);
  lie.add(fish);
  root.add(lie);
  const n = fish.userData.nodes, LIFT = 0.24, HALF = 0.46, SLOT = 1.7, HOP = 0.42;
  let hops = 0, wasAir = -1;
  return {
    root,
    update(t, air = null) {
      if (air !== null) {
        // flopping along: every hop lifts it and arches it the other way, the tail slapping as it lands
        const k = t + phase * 7, side = (hops & 1) ? 1 : -1;
        if (air >= 0 && wasAir < 0) hops++;
        wasAir = air;
        const hop = air >= 0 ? Math.sin(air * Math.PI) : 0;
        const bend = air >= 0 ? Math.sin(air * Math.PI * 2) * 0.6 * side : 0;
        lie.position.set(HALF, LIFT + hop * 0.32, 0);
        lie.rotation.z = Math.PI / 2 + hop * 0.25 * side;
        n.tail.rotation.y = bend + Math.sin(k * 9) * 0.06;
        n.body.rotation.y = -bend * 0.35;
        n.finl.rotation.z = -0.4 + Math.sin(k * 14) * 0.25;
        n.finr.rotation.z = 0.15 - Math.sin(k * 16) * 0.5;
        root.rotation.y *= 0.85; // head the way it goes
        return;
      }
      wasAir = -1;
      const k = t + phase * 7, i = Math.floor(k / SLOT);
      const local = k - i * SLOT - hash(i) * 0.6; // each flop starts at its own time in its slot
      const flip = hash(i + 3) < 0.5 ? 1 : -1; // which way it arches this time
      const hop = local >= 0 && local < HOP ? Math.sin((local / HOP) * Math.PI) : 0;
      const after = local >= HOP ? local - HOP : 9; // settling after it lands
      const bend = hop > 0 ? Math.sin((local / HOP) * Math.PI * 2) * 0.55 * flip : Math.sin(after * 40) * Math.exp(-after * 6) * 0.35 * flip;
      const gasp = Math.sin(k * 9) * 0.06;
      lie.position.set(HALF, LIFT + hop * (0.28 + hash(i + 7) * 0.18), 0);
      lie.rotation.z = Math.PI / 2 + hop * 0.22 * flip + Math.sin(k * 2.3) * 0.03;
      n.tail.rotation.y = bend + gasp;
      n.body.rotation.y = -bend * 0.3;
      n.finl.rotation.z = -0.4 + Math.sin(k * 14) * 0.25; // the fin under it presses flat
      n.finr.rotation.z = 0.15 - Math.sin(k * 11) * 0.45;
      // each flop turns it a little, wandering about its spot (no turn while it lies)
      const p = local < 0 ? 0 : Math.min(1, local / HOP), turn = (j) => (hash(j + 11) - 0.5) * 0.9;
      root.rotation.y = turn(i - 1) + (turn(i) - turn(i - 1)) * p * p * (3 - 2 * p);
    },
  };
}

/**
 * The Pearl Snail King asleep in its shell until woken (owner, 30 October 2026: the hero talks to
 * the pearl on the throne first). `out` and `hid` are buildMonster's boss and bossshell at the same
 * spot and scale `s`. Asleep it rocks a hair in its shell; wake() makes the shell tremble, then the
 * king pushes out of it, growing past its size and settling, and stays out, idling.
 * Once out it crawls when its rules walk it: update(t, dt, walker) with the walker of dungeon-monsters.js.
 * Returns {wake(), awake, update(t, dt, walker)}.
 */
export function sleepingBoss(out, hid, s, phase = 0) {
  let woke = -1, clock = 0;
  out.visible = false;
  return {
    get awake() { return woke >= 0; },
    wake() { if (woke < 0) woke = clock; },
    update(t, dt, walker = null) {
      clock += dt;
      if (woke < 0) {
        hid.scale.setScalar(s);
        idleMonster(hid, 'bossshell', t, phase);
        return;
      }
      const e = clock - woke, SHAKE = 1.1, GROW = 0.8;
      if (e < SHAKE) {
        // the shell trembles harder and harder
        const a = (e / SHAKE) ** 2;
        hid.rotation.z = Math.sin(e * 38) * 0.05 * a;
        hid.scale.set(s * (1 + a * 0.04), s * (1 - a * 0.06), s * (1 + a * 0.04));
        return;
      }
      hid.visible = false;
      out.visible = true;
      const g = Math.min(1, (e - SHAKE) / GROW);
      // out it comes: from low and wide, up past its height, then settles
      const up = g < 1 ? 0.55 + 0.45 * (1 - (1 - g) ** 3) + Math.sin(g * Math.PI) * 0.12 : 1;
      out.scale.set(s * (2 - up) ** 0.3, s * up, s * (2 - up) ** 0.3);
      if (g < 1) return;
      if (walker?.moving) { walkMonster(out, 'boss', walker, t, phase, s); return; }
      out.scale.setScalar(s);
      out.userData.nodes.body.rotation.x = 0;
      idleMonster(out, 'boss', t, phase);
    },
  };
}
