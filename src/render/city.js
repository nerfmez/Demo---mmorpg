// Approved V3: one common placement transform, lossless source geometry and native contours.
import * as THREE from 'three';
import {importJob} from './import-job.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { darker, outlineMaterial } from './toon.js';
import { outlineStructureSteps } from './architecture.js';
import { batchStaticSteps } from './static-batch.js';
import { cityFloorAt } from '../core/city.js';
import { importedMaterialSteps } from './city-palette.js';
import { cityGroundSteps } from './city-ground.js';
import { cityFountain } from './city-fountain.js';
import { cityBankSteps } from './city-bank.js';
import { loadCityDressing } from './city-dressing.js';
import { gradeCapeMeshSteps, trimCityPavingSteps } from './city-cape.js';

const rockBox=new THREE.Box3(),rockCentre=new THREE.Vector3(),rockSize=new THREE.Vector3();
// A source rock stays only where it stands in the game sea, clear of the quay:
// beside the stone wall its low-poly top reads as a flat grey slab.
function rockInWater(mesh,world,root){
  rockBox.setFromObject(mesh).getCenter(rockCentre);rockBox.getSize(rockSize);
  const x=rockCentre.x+root.position.x,z=rockCentre.z+root.position.z,clear=Math.max(rockSize.x,rockSize.z)/2+3;
  if(!world.isWater(x,z))return false;
  for(let i=0;i<8;i++)if(cityFloorAt(world.data.city,x+Math.sin(i*Math.PI/4)*clear,z+Math.cos(i*Math.PI/4)*clear))return false;
  return true;
}

export async function loadCity(world, options = {}) {
  const city = world.data.city;
  if (!city?.enabled) return null;
  const start = performance.now(), loader = options.loader || new GLTFLoader(), job = importJob({...options,loader});
  const root = new THREE.Group(); root.name = 'approved-v3-city';
  root.userData.waterContact=true;
  root.position.fromArray(city.offset);
  let ground,bank,fountainWater;
  try {
  await job.run((function*(){
    ground=yield* cityGroundSteps(world,root,job);
    bank=yield* cityBankSteps(world,root,job);
    fountainWater=cityFountain(root,world,job);job.material(fountainWater);job.own(root);
  })(),'city.preload-assembly');
  // Native timber now owns every deck/pile, with exactly the core dock footprint.
  const runtimeFiles=city.files.filter(file=>file.file!=='10_Timber_Piers.glb');
  const files = await Promise.all(runtimeFiles.map(async file => {
    const gltf = await loader.loadAsync(job.assetURL(file.url));
    return { file, scene: job.raw(gltf.scene) };
  }));
  const originals = new Set(), materials = new Map();
  let meshes = 0;
  await job.run((function*(){
  for (const { file, scene } of files) {
    yield;
    scene.name = file.file;
    scene.updateMatrixWorld(true);
    scene.userData.cityBlackContours=['05_Residential.glb','06_Civic.glb','07_Warehouses.glb','08_Shipyard.glb'].includes(file.file);
    if(file.file==='11_Props.glb')for(const name of city.removedProps||[]){
      const prop=scene.getObjectByName(name);
      if(!prop)throw new Error('Missing city prop: '+name);
      prop.removeFromParent();
      // Removed source nodes remain job-owned until unused-buffer cleanup.
    }
    if(file.file==='11_Props.glb')for(const [name,delta]of Object.entries(city.propOffsets||{})){
      // Move the existing placement-ready node, never clone an offset gallery.
      const prop=scene.getObjectByName(name);
      if(!prop)throw new Error('Missing city prop: '+name);
      prop.position.add(new THREE.Vector3(...delta));
    }
    const solids = [];
    scene.traverse(o => { if (o.isMesh) solids.push(o); });
    for (const mesh of solids) {
      yield;
      const old = mesh.material; originals.add(old);
      if(file.file==='01_Ground.glb'&&/^Mainland[ _]continuous/.test(mesh.name)){
        yield* gradeCapeMeshSteps(mesh,world,root,city.floors[0],false,job);
        if(city.propertyBoundary)yield* trimCityPavingSteps(mesh,world,root,job);
      }
      if(file.file==='01_Ground.glb'&&/^Lighthouse[ _]rock[ _]grassy/.test(mesh.name))yield* gradeCapeMeshSteps(mesh,world,root,city.floors[1],false,job);
      if(file.file==='02_Roads.glb'){
        yield* gradeCapeMeshSteps(mesh,world,root,city.floors[0],true,job);
        if(city.propertyBoundary)yield* trimCityPavingSteps(mesh,world,root,job);
      }
      if(/^Continuous[ _]coastal[ _]cliff[ _]face/.test(mesh.name)){mesh.removeFromParent();continue;}
      if(/^Coastal[ _]weathered[ _]rock/.test(mesh.name)&&!rockInWater(mesh,world,root)){
        // Source rocks follow the authored coastline, not the game's. Keep only
        // those standing in the game sea; inland ones poke through paving/grass.
        mesh.removeFromParent();continue;
      }
      if(/^Coastal[ _]shallow[ _]shelf/.test(mesh.name)){
        // Authored shallow-water context never replaces the actual game sea.
        mesh.removeFromParent();continue;
      }
      const water=mesh.name.startsWith('Fountain') && /(visible_water|upper_pool|highest_pool|visible water|upper pool|highest pool)/.test(mesh.name);
      if(mesh.name.startsWith('Fountain') && /(arcing|falling_stream|falling stream|bronze_finial|bronze finial)/.test(mesh.name)) {
        mesh.removeFromParent();continue;
      }
      meshes++;
      // Indigo/teal timber reads as blue paint on buildings; data maps it to wood.
      mesh.material = yield* importedMaterialSteps(city, old, mesh, materials,job);
      if(water){fountainWater.userData.preparePool(mesh);mesh.material=fountainWater;mesh.userData.skipStructureOutline=true;mesh.castShadow=false;}
      if (mesh.name.startsWith('Mainland_continuous') || /^Mainland[ _]continuous/.test(mesh.name)) mesh.material=ground.material('base');
      if (mesh.name.startsWith('Lighthouse_rock_grassy') || /^Lighthouse[ _]rock[ _]grassy/.test(mesh.name)) mesh.material=ground.material('lawn');
      if(file.file==='02_Roads.glb')mesh.material=ground.material(mesh.name.startsWith('Market')?'plaza':'road');
      mesh.castShadow = !['01_Ground.glb', '02_Roads.glb', '03_Quays.glb'].includes(file.file);
      if(water)mesh.castShadow=false;
      mesh.receiveShadow = true;
      // Open multi-part imported buildings use black feature contours. Inverted
      // hulls on their open gables expose large black faces instead of thin lines.
      if (!water && !scene.userData.cityBlackContours && ['04_Walls.glb', '05_Residential.glb', '06_Civic.glb', '07_Warehouses.glb', '08_Shipyard.glb', '09_Landmarks.glb', '11_Props.glb'].includes(file.file)) {
        const parent = mesh.parent, wrapper = new THREE.Group();
        wrapper.userData.mesh = mesh; parent.add(wrapper); wrapper.add(mesh);
        const hull = new THREE.Mesh(mesh.geometry, outlineMaterial(darker('#' + mesh.material.color.getHexString(), .35), .015));
        hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
        wrapper.add(hull);
      }
    }
    if (!['01_Ground.glb', '02_Roads.glb'].includes(file.file)) yield* outlineStructureSteps(scene,job);
    root.add(scene);job.own(scene);
  }
  })(),'city.postload-assembly');
  const dressing=await loadCityDressing(world,root,loader,job);
  const batch = await job.run(batchStaticSteps(root, { cell: 24, owner:job }), 'city.batch');
  const dispose=job.commit(root);
  return { root, dispose, stats: { assembly: {...job.stats}, readyMs: performance.now() - start, sourceMeshDraws: meshes, batch, treeBeds:ground.trees, bank, dressing, assetBytes: runtimeFiles.reduce((n, f) => n + f.bytes, 0), sourceTriangles: runtimeFiles.reduce((n, f) => n + f.placedTriangles, 0) } };
  } catch(error) {job.abort(root);throw error;}
}
