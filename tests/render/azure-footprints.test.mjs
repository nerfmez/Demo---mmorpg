import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { districtBuilding, harborWorkProp } from '../../src/render/districts.js';
import { marketBuilding, marketDockCargo, marketStall } from '../../src/render/market.js';
import { disposeObject } from '../../src/render/dispose.js';

const world=JSON.parse(readFileSync(new URL('../../data/world.json',import.meta.url)));
function check(plot,make){
  const model=make({...plot,x:0,z:0,angle:0},0);
  try{
    const box=new THREE.Box3().setFromObject(model);
    assert.ok(box.min.x>=-plot.hx-.06 && box.max.x<=plot.hx+.06,plot.id+' model exceeds collider width');
    assert.ok(box.min.z>=-plot.hz-.06 && box.max.z<=plot.hz+.06,plot.id+' model exceeds collider depth');
    assert.ok(box.max.y<=plot.height+.08,plot.id+' model exceeds collider height');
  }finally{disposeObject(model);}
}
test('authored exterior models fit their individual collision footprints',()=>{
  for(const b of world.town.buildings)check(b,b.kind==='shop'?marketBuilding:districtBuilding);
});
test('port equipment and pier cargo fit their authored collision footprints',()=>{
  for(const p of world.harbor.workProps)check(p,harborWorkProp);
  for(const p of world.harbor.dockCargo)check(p,marketDockCargo);
});
test('market canopies, stock and under-counter storage fit each stall collider',()=>{
  for(const stall of world.town.stalls)check(stall,(plot,y)=>marketStall(plot,plot.awningColor,y));
});
