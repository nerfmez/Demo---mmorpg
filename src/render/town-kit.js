// Outpost kit: a non-city town (data town.kit) borrows single buildings and stalls from
// the approved city kit files, so it shares the city's look (palette, open-sheet sides,
// black feature contours). Each world box with a `kit` node name is drawn by that node;
// its collider stays the data box. Loaded once, then merged by the static-cell batcher.
import * as THREE from 'three';
import {importJob} from './import-job.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { outlineStructureSteps } from './architecture.js';
import { importedMaterialSteps } from './city-palette.js';
import { batchStaticSteps } from './static-batch.js';


export async function loadTownKit(world, options={}) {
  const kit = world.data.town?.kit;
  const placed = world.boxes.filter((b) => b.kit);
  if (!kit || !placed.length) return null;
  const start = performance.now(), loader = options.loader||new GLTFLoader(),job=importJob({...options,loader});
  const root = new THREE.Group();root.name='town-kit';
  const box=new THREE.Box3(),centre=new THREE.Vector3();
  try {
  const files = [...new Set(placed.map((b) => kit.nodes[b.kit]?.file))];
  if (files.includes(undefined)) throw new Error('Town kit node without a file');
  const scenes = new Map(await Promise.all(files.map(async (file) => {
    const gltf = await loader.loadAsync(job.assetURL(kit.base+file));
    return [file, job.raw(gltf.scene)];
  })));

  const materials = new Map(), originals = new Set();
  await job.run((function*(){
  for (const b of placed) {
    yield;
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
    const solids=[];source.traverse(o=>{if(o.isMesh)solids.push(o);});
    for(const o of solids){
      yield;
      originals.add(o.material);
      o.material = yield* importedMaterialSteps(kit, o.material, o, materials,job);
      o.castShadow = true;
      o.receiveShadow = true;
    }
    yield* outlineStructureSteps(holder,job);
    root.add(holder);job.own(holder);
  }
  })(),'town-kit.postload-assembly');
  const batch=await job.run(batchStaticSteps(root,{cell:24,owner:job}),'town-kit.batch');
  const dispose=job.commit(root);
  return { root, dispose, stats: { readyMs: performance.now() - start, kitNodes: placed.length, batch } };
  }catch(error){job.abort(root);throw error;}
}
