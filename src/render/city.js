// Approved V3, cooperatively assembled. Authored geometry and gameplay stay intact.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batchStaticSteps } from './static-batch.js';
import { cityGroundSteps } from './city-ground.js';
import { cityFountain } from './city-fountain.js';
import { cityBank } from './city-bank.js';
import { loadCityDressing } from './city-dressing.js';
import { assembleCitySteps } from './city-assembly.js';
import { regionShift, useRegion } from './region-shift.js';
import { runCitySteps, cityAbortError } from './city-work.js';
import { createCityResources, loadCitySource, waitCityLoads } from './city-resources.js';

export async function loadCity(world, { signal, shift = regionShift(), onState = () => {} } = {}) {
  const city = world.data.city;
  if (!city?.enabled) return null;
  const start = performance.now(), loader = new GLTFLoader();
  const root = new THREE.Group(); root.name = 'approved-v3-city';
  root.userData.waterContact = true; root.position.fromArray(city.offset);
  const owner = createCityResources(root), materials = new Map();
  const assembly = {}, preload = {}, dressingWork = {}, batching = {};
  let ground, bank, fountainWater;
  const resume = fn => {
    const previous = regionShift(); useRegion(shift);
    try { return fn(); } finally { useRegion(previous); }
  };
  const release = () => { owner.dispose(); ground?.dispose(); };
  const check = () => { if (signal?.aborted || owner.closed) throw cityAbortError(); };
  const assetURL = file => new URL(file.url, new URL(import.meta.env.BASE_URL, location.href)).href;
  signal?.addEventListener('abort', release, { once: true });
  try {
    check(); onState('assembling');
    await runCitySteps((function* () {
      ground = yield* cityGroundSteps(world, root);
      yield 'retaining bank'; bank = cityBank(world, root);
      yield 'fountain'; fountainWater = owner.ownMaterial(cityFountain(root, world));
    })(), { signal, resume, stats: preload });
    check(); onState('loading');
    // Native timber owns every deck/pile, with the unchanged core dock footprint.
    const runtimeFiles = city.files.filter(file => file.file !== '10_Timber_Piers.glb');
    const files = await waitCityLoads(Promise.all(runtimeFiles.map(async file => ({
      file, scene: await loadCitySource(loader, assetURL(file), owner, signal),
    }))), signal);
    check(); onState('assembling');
    const meshes = await runCitySteps(assembleCitySteps(world, root, files, { ground, fountainWater, materials, owner }), { signal, resume, stats: assembly });
    const dressing = await loadCityDressing(world, root, loader, { owner, signal, resume, stats: dressingWork, assetURL });
    check();
    await runCitySteps(owner.retireOriginals(), { signal, resume, stats: assembly });
    const batch = await runCitySteps(batchStaticSteps(root, { cell: 24 }), { signal, resume, stats: batching });
    check();
    return { root, dispose: release, stats: { readyMs: performance.now() - start, sourceMeshDraws: meshes, batch, treeBeds: ground.trees, bank, dressing, preload, assembly, dressingWork, batching,
      assetBytes: runtimeFiles.reduce((n, f) => n + f.bytes, 0), sourceTriangles: runtimeFiles.reduce((n, f) => n + f.placedTriangles, 0) } };
  } catch (error) { release(); throw error; }
  finally { signal?.removeEventListener('abort', release); }
}
