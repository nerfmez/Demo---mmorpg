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

const data=loadData(),world=createWorld(data.world);
const renderer={domElement:{height:706},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
const steps=acceptedScenerySteps(world,renderer);let built;for(;;){built=steps.next();if(built.done)break;}
const root=built.value.root;root.updateMatrixWorld(true);

test('scene stones and steps stand on the ground the player walks on, moved once with it',()=>{
 const seated=[];root.traverse(o=>{if(o.isMesh&&o.userData.seatedParts)seated.push(o);});
 assert.ok(seated.length,'seated stone meshes');
 const v=new THREE.Vector3(),R=.5;
 for(const scene of acceptedSceneLayout.scenes){
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
});
