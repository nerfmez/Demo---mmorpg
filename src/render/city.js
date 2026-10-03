// Approved V3: one common placement transform, lossless source geometry and native contours.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toon, darker, outlineMaterial } from './toon.js';
import { outlineStructure } from './architecture.js';
import { batchStatic } from './static-batch.js';
import { cityGround } from './city-ground.js';
import { cityFountain } from './city-fountain.js';
import { cityBank } from './city-bank.js';
import { loadCityDressing } from './city-dressing.js';
import { gradeCapeMesh } from './city-cape.js';

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
      if(file.file==='01_Ground.glb'&&/^Mainland[ _]continuous/.test(mesh.name))gradeCapeMesh(mesh,world,root,city.floors[0]);
      if(file.file==='01_Ground.glb'&&/^Lighthouse[ _]rock[ _]grassy/.test(mesh.name))gradeCapeMesh(mesh,world,root,city.floors[1]);
      if(file.file==='02_Roads.glb')gradeCapeMesh(mesh,world,root,city.floors[0],true);
      if(/^Continuous[ _]coastal[ _]cliff[ _]face/.test(mesh.name)){mesh.removeFromParent();mesh.geometry.dispose();continue;}
      if(/^Coastal[ _]shallow[ _]shelf/.test(mesh.name)){
        // Authored shallow-water context never replaces the actual game sea.
        mesh.removeFromParent();mesh.geometry.dispose();continue;
      }
      const water=mesh.name.startsWith('Fountain') && /(visible_water|upper_pool|highest_pool|visible water|upper pool|highest pool)/.test(mesh.name);
      if(mesh.name.startsWith('Fountain') && /(arcing|falling_stream|falling stream|bronze_finial|bronze finial)/.test(mesh.name)) {
        mesh.removeFromParent();mesh.geometry.dispose();continue;
      }
      meshes++;
      const key = `${old.color.getHex()}/${old.emissive?.getHex() || 0}`;
      if (!materials.has(key)) {
        const m = toon('#' + old.color.getHexString()).clone();
        m.color.copy(old.color); m.userData.shared = true;
        if (old.emissive) m.emissive.copy(old.emissive);
        materials.set(key, m);
      }
      mesh.material = materials.get(key);
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
