import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {createCanvas} from '@napi-rs/canvas';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';

// The scene factories draw their foliage textures on a canvas; Node has none.
globalThis.document??={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {acceptedScenerySteps}=await import('../../src/render/accepted-scenes.js');
jsonHook.deregister();

const data=loadData(),world=createWorld(data.world),foliage=data.world.acceptedScenes.foliage;
const renderer={domElement:{height:706},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
const steps=acceptedScenerySteps(world,renderer);let built;for(;;){built=steps.next();if(built.done)break;}
const meshes=[];built.value.root.traverse(o=>{if(o.isInstancedMesh)meshes.push(o);});
const scales=mesh=>{const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),out=[];for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.decompose(p,q,s);out.push(s.y);}return out;};

test('scene trees, shrubs and grass are drawn with the map\'s own materials',()=>{
 const kinds={};for(const mesh of meshes){const kind=mesh.geometry.userData.gameFoliage;if(kind)(kinds[kind]??=[]).push(mesh);}
 for(const kind of['crown','shrub','trunk','grass'])assert.ok(kinds[kind]?.length>=6,kind+' in every scene');
 for(const mesh of[...kinds.crown,...kinds.shrub])assert.match(mesh.material.customProgramCacheKey(),/^anime-branchlet-/);
 for(const mesh of kinds.grass)assert.equal(mesh.name,'ground-blended-grass','scene grass takes the ground colour bake');
 const trunks=kinds.trunk.filter(m=>m.material.side!==THREE.BackSide),hulls=kinds.trunk.filter(m=>m.material.side===THREE.BackSide);
 assert.equal(hulls.length,trunks.length,'one game ink hull per trunk mesh, no scene outline left');
});

test('scene trees stay in the map\'s size range; only the forest cherry keeps its landmark size',()=>{
 const trunks=meshes.filter(m=>m.geometry.userData.gameFoliage==='trunk'&&m.material.side!==THREE.BackSide).flatMap(scales).sort((a,b)=>a-b);
 const map=world.circles.filter(c=>['tree','birch','willow'].includes(c.type)).map(c=>c.scale*.85).sort((a,b)=>a-b);
 assert.ok(trunks.filter(s=>s>foliage.treeMax+1e-6).length<=1,'every tree but the landmark is within treeMax');
 const median=a=>a[a.length>>1];
 assert.ok(Math.abs(median(trunks)-median(map))<.1,`scene median ${median(trunks)} near the map's ${median(map)}`);
});
