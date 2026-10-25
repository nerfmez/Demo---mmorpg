import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {createCanvas} from '@napi-rs/canvas';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {acceptedSceneLayout,sceneWeight} from '../../src/core/accepted-scenes.js';

// The scene factories draw their foliage textures on a canvas; Node has none.
globalThis.document??={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {acceptedScenerySteps}=await import('../../src/render/accepted-scenes.js');
jsonHook.deregister();

const data=loadData();
const renderer={domElement:{height:706},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
// every region that places accepted scenes builds its own scenery, in its own local metres
const regions=[data.world,data.maps['frontier-wilds-v1']].map(wd=>{
 const world=createWorld(wd),steps=acceptedScenerySteps(world,renderer);let built;for(;;){built=steps.next();if(built.done)break;}
 const root=built.value.root;root.updateMatrixWorld(true);return {world,root};
});

test('scene stones and steps stand on the ground the player walks on, moved once with it',()=>{
 const v=new THREE.Vector3(),R=.5;
 for(const {world,root} of regions){
 const seated=[];root.traverse(o=>{if(o.isMesh&&o.userData.seatedParts)seated.push(o);});
 assert.ok(seated.length,'seated stone meshes');
 for(const scene of acceptedSceneLayout.scenes.filter(s=>(s.region||data.world.id)===world.data.id)){
  let cells=0,floating=0;const gaps=[];
  for(const mesh of seated){
   // the lowest point of the stones in each half-metre cell, inside the scene
   const low=new Map(),pos=mesh.geometry.attributes.position;
   for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
    if(sceneWeight(scene,v.x,v.z)<.999)continue;
    const k=Math.floor(v.x/R)+','+Math.floor(v.z/R),c=low.get(k);if(!c||v.y<c.y)low.set(k,{x:v.x,y:v.y,z:v.z});
   }
   for(const c of low.values()){cells++;const gap=c.y-world.groundY(c.x,c.z);gaps.push(gap);if(gap>.6)floating++;}
  }
  if(!cells)continue;
  // A part moved twice (lift or edit applied again) lifts the whole scene's stones.
  gaps.sort((a,b)=>a-b);const median=gaps[gaps.length>>1];
  assert.ok(Math.abs(median)<.3,`${scene.id}: stones sit ${median.toFixed(2)} m off the ground (median)`);
  if(scene.id==='hill-windmill')assert.ok(floating/cells<.02,`${scene.id}: ${floating} of ${cells} stone cells float over 0.6 m`);
 }
 }
});
test('a headland over a seam: each map draws its own half of the rock face, and the halves meet',()=>{
 const v=new THREE.Vector3(),[ox,oz]=data.maps['frontier-wilds-v1'].atlas.offset,ends=[];
 for(const {world,root} of regions){
  const mesh=root.getObjectByName('accepted-edge-cliffs');assert.ok(mesh,world.data.id+' draws its edge cliffs');
  const b=world.data.bounds,pos=mesh.geometry.attributes.position,shift=world.data.id===data.world.id?[0,0]:[ox,oz];
  let near=Infinity,far=0;
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);far=Math.max(far,b.minX-v.x,v.x-b.maxX);if(v.z>70-shift[1]&&v.z<90-shift[1])near=Math.min(near,Math.abs(v.x+shift[0]-data.world.bounds.minX));}
  assert.ok(far<2.5,world.data.id+' faces stay within a sample of its bounds ('+far.toFixed(2)+' m over)');
  ends.push(near);
 }
 // the sea cliff crosses the seam: both halves reach it
 for(const d of ends)assert.ok(d<.6,'face reaches the seam ('+d.toFixed(2)+' m)');
});
