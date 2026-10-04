// Approved V3: one common placement transform, lossless source geometry and native contours.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { darker, outlineMaterial } from './toon.js';
import { outlineStructure } from './architecture.js';
import { batchStatic } from './static-batch.js';
import { cityFloorAt } from '../core/city.js';
import { importedMaterial } from './city-palette.js';
import { cityGround } from './city-ground.js';
import { cityFountain } from './city-fountain.js';
import { cityBank } from './city-bank.js';
import { loadCityDressing } from './city-dressing.js';
import { gradeCapeMesh, trimCityPaving } from './city-cape.js';

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

export async function loadCity(world) {
  const city = world.data.city;
  if (!city?.enabled) return null;
  const start = performance.now(), loader = new GLTFLoader();
  const root = new THREE.Group(); root.name = 'approved-v3-city';
  root.userData.waterContact=true;
  root.position.fromArray(city.offset);
  const ground = cityGround(world, root);
  const bank=cityBank(world,root);
  const fountainWater = cityFountain(root, world);
  // Native timber now owns every deck/pile, with exactly the core dock footprint.
  const runtimeFiles=city.files.filter(file=>file.file!=='10_Timber_Piers.glb');
  const files = await Promise.all(runtimeFiles.map(async file => {
    const gltf = await loader.loadAsync(new URL(file.url, new URL(import.meta.env.BASE_URL, location.href)).href);
    return { file, scene: gltf.scene };
  }));
  const originals = new Set(), materials = new Map();
  let meshes = 0;
  for (const { file, scene } of files) {
    scene.name = file.file;
    scene.updateMatrixWorld(true);
    scene.userData.cityBlackContours=['05_Residential.glb','06_Civic.glb','07_Warehouses.glb','08_Shipyard.glb'].includes(file.file);
    if(file.file==='11_Props.glb')for(const [name,delta]of Object.entries(city.propOffsets||{})){
      // Move the existing placement-ready node, never clone an offset gallery.
      const prop=scene.getObjectByName(name);
      if(!prop)throw new Error('Missing city prop: '+name);
      prop.position.add(new THREE.Vector3(...delta));
    }
    const solids = [];
    scene.traverse(o => { if (o.isMesh) solids.push(o); });
    for (const mesh of solids) {
      const old = mesh.material; originals.add(old);
      if(file.file==='01_Ground.glb'&&/^Mainland[ _]continuous/.test(mesh.name)){
        gradeCapeMesh(mesh,world,root,city.floors[0]);
        if(city.propertyBoundary)trimCityPaving(mesh,world,root);
      }
      if(file.file==='01_Ground.glb'&&/^Lighthouse[ _]rock[ _]grassy/.test(mesh.name))gradeCapeMesh(mesh,world,root,city.floors[1]);
      if(file.file==='02_Roads.glb'){
        gradeCapeMesh(mesh,world,root,city.floors[0],true);
        if(city.propertyBoundary)trimCityPaving(mesh,world,root);
      }
      if(/^Continuous[ _]coastal[ _]cliff[ _]face/.test(mesh.name)){mesh.removeFromParent();mesh.geometry.dispose();continue;}
      if(/^Coastal[ _]weathered[ _]rock/.test(mesh.name)&&!rockInWater(mesh,world,root)){
        // Source rocks follow the authored coastline, not the game's. Keep only
        // those standing in the game sea; inland ones poke through paving/grass.
        mesh.removeFromParent();mesh.geometry.dispose();continue;
      }
      if(/^Coastal[ _]shallow[ _]shelf/.test(mesh.name)){
        // Authored shallow-water context never replaces the actual game sea.
        mesh.removeFromParent();mesh.geometry.dispose();continue;
      }
      const water=mesh.name.startsWith('Fountain') && /(visible_water|upper_pool|highest_pool|visible water|upper pool|highest pool)/.test(mesh.name);
      if(mesh.name.startsWith('Fountain') && /(arcing|falling_stream|falling stream|bronze_finial|bronze finial)/.test(mesh.name)) {
        mesh.removeFromParent();mesh.geometry.dispose();continue;
      }
      meshes++;
      // Indigo/teal timber reads as blue paint on buildings; data maps it to wood.
      mesh.material = importedMaterial(city, old, mesh, materials);
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
    if (!['01_Ground.glb', '02_Roads.glb'].includes(file.file)) outlineStructure(scene);
    root.add(scene);
  }
  for (const material of originals) material.dispose();
  const dressing=await loadCityDressing(world,root,loader);
  const batch = batchStatic(root, { cell: 24 });
  return { root, stats: { readyMs: performance.now() - start, sourceMeshDraws: meshes, batch, treeBeds:ground.trees, bank, dressing, assetBytes: runtimeFiles.reduce((n, f) => n + f.bytes, 0), sourceTriangles: runtimeFiles.reduce((n, f) => n + f.placedTriangles, 0) } };
}
