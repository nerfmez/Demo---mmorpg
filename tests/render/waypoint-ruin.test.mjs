import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {createCanvas} from '@napi-rs/canvas';
import {disposeObject} from '../../src/render/dispose.js';

// The pillar draws its carvings and glow on a canvas; Node has none.
globalThis.document??={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {waypointRuin,updateWaypointRuin}=await import('../../src/render/waypoint-ruin.js');
const art=(await import('../../data/art.json',{with:{type:'json'}})).default;
jsonHook.deregister();

const drawables=root=>{const list=[];root.traverse(o=>{if(o.isMesh||o.isPoints||o.isSprite)list.push(o);});return list;};

test('every waypoint is the beach pillar in a few draws: its twenty blocks are bones of one skinned mesh',()=>{
 const a=waypointRuin(3),b=waypointRuin(11);
 const skinned=drawables(a).filter(o=>o.isSkinnedMesh);
 assert.equal(skinned.length,4,'blocks, their outline, grooves and groove glow');
 assert.ok(skinned.every(m=>m.skeleton===skinned[0].skeleton&&m.skeleton.bones.length===20));
 assert.ok(drawables(a).length<=20,'about a dozen draws (dust sprites only while blocks land)');
 // shapes are shared by all waypoints; each owns its skeleton
 const geos=o=>new Set(drawables(o).filter(m=>m.isMesh&&!m.isSprite&&m.geometry.userData.shared).map(m=>m.geometry));
 for(const g of geos(a))assert.ok(geos(b).has(g));
 assert.notEqual(drawables(b).find(o=>o.isSkinnedMesh).skeleton,skinned[0].skeleton);
});

test('a locked waypoint is a heap; unlocked it rebuilds into the pillar in assemble seconds; a built one is shown built',()=>{
 const root=waypointRuin(5),W=root.userData.ruin,cap=W.blocks.find(b=>b.float===1);
 updateWaypointRuin(root,false,1/30,0);
 assert.ok(W.blocks.every(b=>b.bone.position.y<1.1),'all blocks lie in the heap');
 for(let t=0;t<art.waypointRuin.assemble+.2;t+=1/30)updateWaypointRuin(root,true,1/30,t);
 assert.ok(Math.abs(cap.bone.position.y-cap.a[1])<.1,'the capstone floats over the pillar');
 for(const b of W.blocks.filter(b=>!b.float))assert.ok(b.bone.position.distanceTo(new THREE.Vector3(...b.a))<.03,'block '+b.order+' locked into place');
 const seen=waypointRuin(5);updateWaypointRuin(seen,true,1/30,0);
 assert.equal(seen.userData.ruin.T,art.waypointRuin.assemble,'unlocked before it was first seen: built at once');
});

test('releasing a waypoint frees its own materials and skeleton, never the shared shapes',()=>{
 const root=waypointRuin(7),shared=new Set();
 root.traverse(o=>{if(o.geometry?.userData.shared)shared.add(o.geometry);});
 let freed=0;for(const g of shared)g.addEventListener('dispose',()=>freed++);
 const skeleton=drawables(root).find(o=>o.isSkinnedMesh).skeleton;let bones=0;skeleton.dispose=()=>{bones++;};
 disposeObject(root);
 assert.equal(freed,0);assert.ok(bones>=1);
});
