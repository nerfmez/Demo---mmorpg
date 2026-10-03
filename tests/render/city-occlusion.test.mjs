import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {pointInPolygon} from '../../src/core/math.js';
import {coveredTerrainCell} from '../../src/render/city-terrain.js';

test('native terrain peaks, source slab edges and concave corners remain rendered',()=>{
  const city={enabled:true,floors:[{height:1,points:[[0,0],[20,0],[20,5],[5,5],[5,20],[0,20]]}]};
  assert.equal(coveredTerrainCell(city,2.5,2.5,0,1),true);
  assert.equal(coveredTerrainCell(city,4.5,4.5,0,1),false,'retain concave edge band');
  assert.equal(coveredTerrainCell(city,.5,2.5,0,1),false,'retain boundary strip');
  assert.equal(coveredTerrainCell(city,2.5,2.5,.96,1),false,'native peak reaches slab');
  assert.equal(coveredTerrainCell(city,10,10,0,1),false,'outside source slab');
  assert.equal(coveredTerrainCell({...city,enabled:false},2.5,2.5,0,1),false);
  const holed={enabled:true,floors:[{height:1,points:[[0,0],[30,0],[30,30],[0,30]],holes:[[[10,10],[20,10],[20,20],[10,20]]]}]};
  assert.equal(coveredTerrainCell(holed,15,15,0,1),false,'retain native terrain in source holes');
  assert.equal(coveredTerrainCell(holed,9.5,15,0,1),false,'retain hole boundary band');
});
test('real city coverage preserves the native heightfield and contains every omitted quad',()=>{
  const world=createWorld(loadData().world),hf=world.heightfield,original=hf.data.slice(),city=world.data.city;
  let removed=0,kept=0;
  for(let j=0;j<hf.h-1;j++)for(let i=0;i<hf.w-1;i++){
    const x=hf.ox+(i+.5)*hf.res,z=hf.oz+(j+.5)*hf.res,k=j*hf.w+i;
    const max=Math.max(hf.data[k],hf.data[k+1],hf.data[k+hf.w],hf.data[k+hf.w+1]);
    if(!coveredTerrainCell(city,x,z,max,hf.res)){kept++;continue;}removed++;
    assert.ok(city.floors.some(f=>max<f.height-.05&&[-.5,0,.5].every(dx=>[-.5,0,.5].every(dz=>pointInPolygon(f.points,x+dx*hf.res,z+dz*hf.res)&&!f.holes?.some(hole=>pointInPolygon(hole,x+dx*hf.res,z+dz*hf.res))))),'entire omitted quad is below opaque source slab');
  }
  assert.ok(removed>5000);assert.ok(kept>removed);assert.deepEqual(hf.data,original);
});
