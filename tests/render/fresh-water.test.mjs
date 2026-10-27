import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {terrainDomain} from '../../src/render/terrain-domain.js';
import {finishSteps} from '../../src/render/build-queue.js';
import {disposeObject} from '../../src/render/dispose.js';
import {pondRim} from '../../src/core/ponds.js';
import mirror from '../../data/accepted-scenes/mirror-pond.json' with {type:'json'};

const hook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {waterSteps}=await import('../../src/render/ground.js');
hook.deregister();
const data=loadData();
const build=id=>{const w=createWorld(data.maps[id]);return {w,group:finishSteps(waterSteps(w,null,{domain:terrainDomain(w)}))};};
const fresh=group=>group.children.filter(m=>m.geometry.attributes.flow);
// polar extent of a mesh's wet vertices round a centre, per angle bucket
const wetReach=(mesh,cx,cz,buckets=36)=>{
 const p=mesh.geometry.attributes.position,d=mesh.geometry.attributes.depth,out=new Array(buckets).fill(0);
 for(let i=0;i<p.count;i++){if(d.getX(i)<=0)continue;const dx=p.getX(i)-cx,dz=p.getZ(i)-cz,b=Math.floor((Math.atan2(dz,dx)+Math.PI)/(2*Math.PI)*buckets)%buckets;out[b]=Math.max(out[b],Math.hypot(dx,dz));}
 return out;
};

test('Mirror Pond is one sheet of water drawn to the scene\'s own waterline, not its collision circles',()=>{
 const {group}=build('moonroot-grove-v1'),meshes=fresh(group),sp=mirror.pond,reach=wetReach(meshes[0],sp.x,sp.z,72);
 assert.equal(meshes.length,1,'one pond mesh for the seven collision circles');
 // never past the scene's waterline; where the scene's ground (its stair foot, rim rocks) rises
 // inside it the water ends at that ground, elsewhere it reaches the waterline
 let near=0;
 for(let i=0;i<72;i++){assert.ok(reach[i]<sp.radius[i]+.9,`water at ${i*5}° stays inside the scene's waterline (${reach[i].toFixed(2)} vs ${sp.radius[i]})`);if(reach[i]>sp.radius[i]-1.2)near++;}
 assert.ok(near>=54,`the water reaches the waterline round most of the pond (${near}/72)`);
 disposeObject(group);
});

test('a wobbled pond\'s water follows its natural rim; the stream carries flow coordinates',()=>{
 const {w,group}=build('frontier-wilds-v1'),meshes=fresh(group);
 const ponds=w.data.ponds,river=meshes.filter(m=>m.geometry.attributes.flow.getX(0)===1);
 assert.equal(meshes.length,ponds.length+1,'one mesh per pond and one for the stream');
 assert.equal(river.length,1);
 const along=river[0].geometry.attributes.along,across=river[0].geometry.attributes.across;
 assert.ok(along.getX(along.count-1)>300,'along runs the stream\'s length in metres');
 let maxAcross=0;for(let i=0;i<across.count;i++)maxAcross=Math.max(maxAcross,Math.abs(across.getX(i)));
 assert.ok(Math.abs(maxAcross-(w.data.river.width/2+1.6))<1e-3,'across spans the channel and its bank');
 for(const pond of ponds.filter(p=>p[3])){
  const mesh=meshes.find(m=>{const b=m.geometry.boundingSphere;return m.geometry.attributes.flow.getX(0)===0&&Math.hypot(b.center.x-pond[0],b.center.z-pond[1])<2;});
  assert.ok(mesh,'pond mesh '+pond);
  const reach=wetReach(mesh,pond[0],pond[1],36);
  for(let b=0;b<36;b++){
   const rim=pondRim(pond,(b+.5)/36*2*Math.PI-Math.PI);
   assert.ok(reach[b]>rim-.6&&reach[b]<rim+1.3,`pond ${pond} at bucket ${b}: water to ${reach[b].toFixed(2)}, rim ${rim.toFixed(2)}`);
  }
 }
 disposeObject(group);
});
