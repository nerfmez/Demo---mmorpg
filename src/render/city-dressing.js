// Placement-ready kit files, loaded once and merged by the existing static-cell batcher.
import * as THREE from 'three';
import {toon} from './toon.js';
import {outlineStructureSteps} from './architecture.js';
import { cityColor } from './city-palette.js';

export async function loadCityDressing(world,root,loader,job){
  const config=world.data.city.dressing;
  if(!config)return {instances:0,uniqueTypes:0,assetBytes:0};
  const ids=[...new Set(config.placements.map(p=>p.asset))],templates=new Map(),oldMaterials=new Set();
  const loaded=await Promise.all(ids.map(async id=>{
    const file=config.assets[id],gltf=await loader.loadAsync(job.assetURL(file.url));
    return [id,job.raw(gltf.scene)];
  }));
  await job.run((function*(){
    for(const [id,scene]of loaded){
      const solids=[];scene.traverse(o=>{if(o.isMesh)solids.push(o);});
      for(const o of solids){
        yield;oldMaterials.add(o.material);o.material=toon('#'+cityColor(world.data.city,o.material,o.name).getHexString(),{side:o.material.side});o.castShadow=false;o.receiveShadow=true;
      }
      yield* outlineStructureSteps(scene,job);templates.set(id,scene);
    }
  for(const p of config.placements){
    yield;
    const group=templates.get(p.asset).clone(true);group.name=p.id;
    group.position.set(p.x-root.position.x,world.groundY(p.x,p.z)+(p.lift||0)-root.position.y,p.z-root.position.z);
    group.rotation.y=p.angle;group.scale.setScalar(p.scale);root.add(group);job.own(group);
  }
  })(),'city.dressing-assembly'); // source materials are released by the import owner
  return {instances:config.placements.length,uniqueTypes:ids.length,assetBytes:ids.reduce((n,id)=>n+config.assets[id].bytes,0),placedTriangles:config.placements.reduce((n,p)=>n+config.assets[p.asset].triangles,0)};
}
