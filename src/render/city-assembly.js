// The approved city mesh pass, incrementally executed while its root is detached.
import * as THREE from 'three';
import { darker, outlineMaterial } from './toon.js';
import { outlineStructureSteps } from './architecture.js';
import { cityFloorAt } from '../core/city.js';
import { importedMaterialSteps } from './city-palette.js';
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

export function* assembleCitySteps(world, root, files, { ground, fountainWater, materials, owner }) {
  const city = world.data.city;

  let meshes = 0;
  for (const { file, scene } of files) {
    yield;
    scene.name = file.file;
    scene.updateMatrixWorld(true);
    scene.userData.cityBlackContours=['05_Residential.glb','06_Civic.glb','07_Warehouses.glb','08_Shipyard.glb'].includes(file.file);
    if(file.file==='11_Props.glb')for(const name of city.removedProps||[]){
      const prop=scene.getObjectByName(name);
      if(!prop)throw new Error('Missing city prop: '+name);
      owner.drop(prop); yield;
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
      yield 'mesh: ' + mesh.name;
      const old = mesh.material; owner.original(old);
      if(file.file==='01_Ground.glb'&&/^Mainland[ _]continuous/.test(mesh.name)){
        yield* gradeCapeMeshSteps(mesh,world,root,city.floors[0]);
        if(city.propertyBoundary)yield* trimCityPavingSteps(mesh,world,root);
      }
      if(file.file==='01_Ground.glb'&&/^Lighthouse[ _]rock[ _]grassy/.test(mesh.name))yield* gradeCapeMeshSteps(mesh,world,root,city.floors[1]);
      if(file.file==='02_Roads.glb'){
        yield* gradeCapeMeshSteps(mesh,world,root,city.floors[0],true);
        if(city.propertyBoundary)yield* trimCityPavingSteps(mesh,world,root);
      }
      if(/^Continuous[ _]coastal[ _]cliff[ _]face/.test(mesh.name)){owner.drop(mesh);continue;}
      if(/^Coastal[ _]weathered[ _]rock/.test(mesh.name)&&!rockInWater(mesh,world,root)){
        // Source rocks follow the authored coastline, not the game's. Keep only
        // those standing in the game sea; inland ones poke through paving/grass.
        owner.drop(mesh);continue;
      }
      if(/^Coastal[ _]shallow[ _]shelf/.test(mesh.name)){
        // Authored shallow-water context never replaces the actual game sea.
        owner.drop(mesh);continue;
      }
      const water=mesh.name.startsWith('Fountain') && /(visible_water|upper_pool|highest_pool|visible water|upper pool|highest pool)/.test(mesh.name);
      if(mesh.name.startsWith('Fountain') && /(arcing|falling_stream|falling stream|bronze_finial|bronze finial)/.test(mesh.name)) {
        owner.drop(mesh);continue;
      }
      meshes++;
      // Indigo/teal timber reads as blue paint on buildings; data maps it to wood.
      yield 'material: ' + mesh.name;
      mesh.material = yield* importedMaterialSteps(city, old, mesh, materials);
      owner.ownMaterial(mesh.material);
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
    if (!['01_Ground.glb', '02_Roads.glb'].includes(file.file)) { yield 'contours: ' + file.file; yield* outlineStructureSteps(scene); }
    root.add(scene);
  }
  return meshes;
}
