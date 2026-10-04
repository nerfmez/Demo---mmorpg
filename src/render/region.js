// One map's static scene (terrain, scenery, water, city/outpost kits, town NPCs) as a
// region the View can hold beside another. The active region sits at the scene origin;
// a neighbouring map is placed at its atlas delta, and its ground/water shaders take
// the same delta as their region shift (region-shift.js). `regionSteps` yields between
// the heavy parts so a neighbour can stream in over many frames; `buildRegion` runs it
// all at once for the starting map.
import * as THREE from 'three';
import { terrainSteps, createWater, releaseGroundCaches } from './ground.js';
import { environmentSteps } from './environment.js';
import { batchStatic } from './static-batch.js';
import { bakeGrassSteps } from './grass.js';
import { attachWindShadow } from './patch.js';
import { buildHumanoid, HumanoidAnimator } from './hero.js';
import { residentTool } from './districts.js';
import { loadCity } from './city.js';
import { loadTownKit } from './town-kit.js';
import { disposeObject } from './dispose.js';
import { beginRegion, useRegion } from './region-shift.js';
import { toon } from './toon.js';
import { glowTexture } from './vfx.js';

export function* regionSteps(view, world) {
  const shift = beginRegion();
  const root = new THREE.Group();
  root.name = 'region-' + world.data.id;
  const region = { world, shift, root, npcs: [], npcMarkers: [], fires: [], chimneys: [], grass: [], waypointStones: new Map(), disposed: false, ready: null, stats: {} };

  region.terrain = yield* inRegion(shift, terrainSteps(world));
  root.add(region.terrain.group);
  yield;
  useRegion(shift); // another build may have run in between
  const env = yield* inRegion(shift, environmentSteps(world));
  yield;
  useRegion(shift); // another build may have run in between
  // Keep only authored native hull/pile contact roots before batching moves
  // their geometry. These CPU-only clones share buffers and are never rendered.
  const nativeContacts = new THREE.Group();
  if (world.data.city?.enabled) {
    env.root.updateMatrixWorld(true);
    env.root.traverse((o) => {
      if (o.userData.waterContact) {
        const copy = o.clone(true);
        o.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
        nativeContacts.add(copy);
      }
    });
  }
  if (!world.data.city?.enabled) root.add(createWater(world, env.root));
  env.root.traverse(attachWindShadow); // one-time setup; no per-frame allocation
  yield;
  useRegion(shift); // another build may have run in between
  yield* inRegion(shift, bakeGrassSteps(view.renderer, env.root, world)); // GPU passes per chunk; blades then just read colours
  yield;
  useRegion(shift); // another build may have run in between
  // after the water-contact bake: merge fixed scenery that shares a material, per map cell
  region.staticBatch = batchStatic(env.root, { exclude: [...(env.waypoints?.values?.() || [])] });
  root.add(env.root);
  env.root.traverse((o) => o.userData.grassCulling && region.grass.push(o));
  region.waypointStones = env.waypoints;
  yield;
  useRegion(shift); // another build may have run in between

  // Town NPCs
  const t = world.data.town;
  const smith = buildHumanoid({ skin: '#e8b890', hair: '#8a4a2a', tunic: '#d9c7a8', hairStyle: 'short' }, {}, { npc: true, apron: '#5b3a22', beard: '#8a4a2a' });
  smith.root.position.set(t.workbench[0] + 1.6, world.groundY(t.workbench[0] + 1.6, t.workbench[1] + 0.2), t.workbench[1] + 0.2);
  smith.root.rotation.y = -Math.PI / 2 - 0.4;
  smith.job = 'smith';
  const trainer = buildHumanoid({ skin: '#f6d2b5', hair: '#f0d48a', tunic: '#fbf6ee', scarf: '#3b6ad0', eyes: '#3a6ad0' }, {}, { npc: true, longHair: true, straps: true, scarf: true });
  trainer.root.position.set(t.trainer[0] + 1.2, world.groundY(t.trainer[0] + 1.2, t.trainer[1] - 0.2), t.trainer[1] - 0.2);
  trainer.root.rotation.y = -Math.PI / 2 + 0.3;
  trainer.job = 'trainer';
  const townNpcs = [smith, trainer];
  for (const resident of t.residents || []) {
    const n = buildHumanoid(resident.look, {}, { npc: true, ...(resident.outfit || {}) });
    n.root.position.set(resident.x, world.groundY(resident.x, resident.z), resident.z);
    n.root.rotation.y = resident.angle;
    n.root.userData.residentId = resident.id;
    n.scenery = true;
    n.activity = resident.activity;
    if (resident.tool) n.bones.handR.add(residentTool(resident.tool));
    townNpcs.push(n);
  }
  for (const n of townNpcs) {
    n.anim = new HumanoidAnimator(n);
    n.idleState = { speed: 0, facing: n.root.rotation.y, moving: false, dash: null, dead: false, time: 0 };
    root.add(n.root);
    if (n.scarf) root.add(n.scarf.mesh);
    region.npcs.push(n);
  }
  region.npcMarkers = [marker(root, world, t.workbench[0], t.workbench[1], '#ffd166'), marker(root, world, t.trainer[0], t.trainer[1], '#8fd0ff')];

  // campfire flame and house chimneys
  if (world.data.camp) {
    const [fx, fz] = world.data.camp.fire;
    const f = view.vfx.sprite(0xffa040, 1.6, 0.9);
    f.position.set(fx, world.groundY(fx, fz) + 0.6, fz);
    root.add(f);
    region.fires.push({ sprite: f, x: fx, z: fz });
  }
  region.chimneys = world.boxes.filter((b) => b.type === 'house' && !b.kit).map((b) => new THREE.Vector3(b.x, world.groundY(b.x, b.z) + 4.9, b.z));

  // Imported kits load in the background; a region disposed meanwhile drops them.
  const keep = (obj) => {
    if (region.disposed) {
      disposeObject(obj);
      return false;
    }
    root.add(obj);
    return true;
  };
  region.ready = loadCity(world)
    .then((city) => {
      if (!city || region.disposed) return city && disposeObject(city.root);
      useRegion(shift);
      region.cityRoot = city.root;
      region.stats.city = city.stats;
      // One bake from actual native hulls and imported foundations/piles.
      const start = performance.now();
      nativeContacts.add(city.root);
      const water = createWater(world, nativeContacts);
      nativeContacts.remove(city.root);
      keep(city.root);
      keep(water);
      city.stats.waterContactMs = performance.now() - start;
      city.stats.waterContactSections = water.userData.contactSections;
    })
    .then(() => loadTownKit(world))
    .then((kit) => {
      if (kit && keep(kit.root)) {
        region.townKitRoot = kit.root;
        region.stats.townKit = kit.stats;
      }
    });
  return region;
}

// Materials made inside a nested build take this region's shift on every resume.
function* inRegion(shift, steps) {
  for (;;) {
    useRegion(shift);
    const r = steps.next();
    if (r.done) return r.value;
    yield;
  }
}

/** Build a whole region now (the starting map). */
export function buildRegion(view, world) {
  const steps = regionSteps(view, world);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Place a region `delta` metres from the active map's origin (shaders follow). */
export function placeRegion(region, dx, dz) {
  const root = region.root;
  root.position.set(dx, 0, dz);
  region.shift.value.set(dx, 0, dz);
  // Static scenery is frozen after batching (matrixWorldAutoUpdate off), so three never
  // recomputes it, even when forced. Recompose every world matrix here, parents first.
  root.updateMatrix();
  root.traverse((o) => {
    if (o === root) o.matrixWorld.copy(o.matrix);
    else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  });
}

export function disposeRegion(region) {
  region.disposed = true;
  region.root.removeFromParent();
  for (const n of region.npcs) n.scarf?.mesh?.removeFromParent();
  disposeObject(region.root);
  releaseGroundCaches(region.world);
}

function marker(root, world, x, z, color) {
  const y = world.groundY(x, z);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(0.8, 0.8, 1);
  s.position.set(x, y + 3.2, z);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), toon(color, { emissive: color, emissiveIntensity: 0.6 }));
  gem.position.set(x, y + 3.2, z);
  gem.userData.baseY = y + 3.2;
  root.add(s, gem);
  return gem;
}
