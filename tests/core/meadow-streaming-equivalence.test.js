import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRng} from '../../src/core/rng.js';
const art=JSON.parse(readFileSync(new URL('../../data/art.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../../src/render/meadow.js',import.meta.url),'utf8');
// Restore the original indivisible plant callback as a reference. The math,
// rejection branches and seeded RNG calls are intentionally unchanged.
const begin=source.indexOf('const plant=function*'),end=source.indexOf('  let done=0;',begin);
const legacy=source.slice(0,begin)+source.slice(begin,end).replace('const plant=function*','const plant=function').replace(/if\(k&&k%8===0\)yield;/,'')+source.slice(end);
const make=s=>Function('art','createRng','worldMeadow','surfaceData','outsideRoadDistance','cityFloorAt','cityPlantingFloorAt',s.replace(/^import[^\n]+\n/gm,'').replace(/\bexport /g,'')+'\nreturn meadowPlantSteps;')(art,createRng,(x,z)=>.55+.3*Math.sin(x*.07+z*.12),w=>w.fields,()=>10,()=>false,(city,x,z)=>x>8&&z>8);
const reference=make(legacy.replaceAll('yield* plant(', 'plant(')),sliced=make(source);
function world(){
 const data={atlas:{offset:[91,-32]},city:{propertyBoundary:{restoredLawnSpacing:4,previousPaving:{bounds:[-20,20,-20,20]}}}};
 const heightfield={w:64,h:64,ox:-32,oz:-32,res:1},field=()=>new Float32Array(64*64);
 return {data,heightfield,bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},fields:{coast:new Float32Array(64*64*2),road:field(),stone:field(),mud:field(),dirt:field()},
  decor:{grass:[{x:-4,z:-4,s:.8},{x:6,z:7,s:1}],flowers:[{x:-3,z:-5,s:1,color:0},{x:8,z:-7,s:.9,color:3}]},roads:[],
  zoneAt:(x,z)=>({safe:x<0&&z<0}),isWater:(x,z)=>x<-22,dockAt:()=>false,slopeAt:()=>.1,isFree:(x,z)=>!(x>15&&z<0),groundY:(x,z)=>x*.001+z*.002};
}
test('smaller meadow slices preserve every town/wild/flower/restored placement and RNG call',()=>{
 const w=world(),extra=[{x:-8,z:-8,s:.7}];const collect=steps=>{let count=0;for(;;){const r=steps.next();count++;if(r.done)return {result:r.value,count};}};
 const before=collect(reference(w,extra)),after=collect(sliced(w,extra));
 assert.ok(after.count>before.count*2);assert.ok(after.result.grass.length>100);assert.ok(after.result.flowers.length>0);assert.deepEqual(after.result,before.result);
});
