import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { prepareWeaponModel } from '../../src/render/models.js';
const registry=JSON.parse(readFileSync(new URL('../../data/models.json',import.meta.url))).weapons;
const items=JSON.parse(readFileSync(new URL('../../data/items.json',import.meta.url))).gearBases;

test('every weapon base has an approved on-demand asset',()=>{
 for(const [id,item] of Object.entries(items)) if(item.slot==='weapon') assert.ok(registry[id],id);
 for(const [id,m] of Object.entries(registry)) if(m.sourceTransform){
  const t=m.sourceTransform;
  assert.ok(t.scale>0&&t.scale<2,id+' uniform scale');
  for(const v of [t.grip,t.rotation]) assert.ok(v.length===3&&v.every(Number.isFinite),id+' finite fit');
 }
});

test('source fitting seats the chosen grip without mutating source geometry or disposing retained maps',()=>{
 const scene=new THREE.Group(),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([1,2,3,1,3,3,2,2,3],3));
 const texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture});
 let disposed=false;texture.addEventListener('dispose',()=>disposed=true);
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
 const prepared=prepareWeaponModel(scene,{sourceTransform:{grip:[1,2,3],rotation:[Math.PI/2,0,0],scale:.5}});
 assert.deepEqual(Array.from(geometry.attributes.position.array),[1,2,3,1,3,3,2,2,3]);
 const p=prepared.parts[0].geometry.attributes.position;
 assert.deepEqual([p.getX(0),p.getY(0),p.getZ(0)],[0,0,0]);
 assert.ok(Math.abs(p.getZ(1)-.5)<1e-6);
 assert.ok(prepared.parts[0].geometry.userData.shared);
 assert.equal(prepared.parts[0].material.map,texture);assert.equal(disposed,false);assert.ok(texture.userData.shared);
});
