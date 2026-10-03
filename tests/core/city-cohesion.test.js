import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {cityFloorAt} from '../../src/core/city.js';
import {fromBoxLocal} from '../../src/core/math.js';

const data=loadData(),world=createWorld(data.world),city=data.world.city;
test('each boat has a clear water berth beside a single pier, including its bow and stern',()=>{
  assert.equal(world.docks.length,11);assert.equal(data.world.city.joins.length,0);
  assert.equal(city.boatBerths.length,9);
  // Conservative envelope around the actual native fishing-boat hull and rubbing strakes.
  const hull=[[-.9,-3.4],[-1.3,-2],[-1.38,0],[-1.16,2.3],[-.66,3.5],[0,4.0],[.66,3.5],[1.16,2.3],[1.38,0],[1.3,-2],[.9,-3.4]];
  for(const berth of city.boatBerths){
    const [x,z,a]=data.world.harbor.boats[berth.boat],dock=world.docks[berth.dock];
    assert.ok(world.inSea(x,z),'boat '+berth.boat+' uses native water');
    assert.ok(Math.abs(a-dock.angle)<1e-6,'boat is parallel to its pier');
    for(const [lx,lz]of hull){
      const px=x+Math.cos(a)*lx+Math.sin(a)*lz,pz=z-Math.sin(a)*lx+Math.cos(a)*lz;
      assert.equal(cityFloorAt(city,px,pz),null,'boat '+berth.boat+' clears land/quay');
      assert.equal(world.dockAt(px,pz),null,'boat '+berth.boat+' clears timber');
    }
  }
});
test('flush deck entrances support a walking actor across wood/stone junctions',()=>{
  for(const dock of world.docks){
    assert.ok(dock.shoreCut.length===2);
    const end=(dock.shoreCut[0]+dock.shoreCut[1])/2,a=fromBoxLocal(dock,0,end-.5),b=fromBoxLocal(dock,0,end+.6);
    assert.ok(world.isFree(a.x,a.z,.45),dock.id+' landward deck');
    assert.ok(world.isFree(b.x,b.z,.45),dock.id+' stone landing');
    assert.ok(cityFloorAt(city,b.x,b.z),dock.id+' landing is actual source ground');
    let pos=a;
    for(let n=1;n<=22;n++){
      const p=fromBoxLocal(dock,0,end-.5+n*.05),m=world.move(pos.x,pos.z,.45,p.x-pos.x,p.z-pos.z);
      assert.ok(Math.hypot(m.x-p.x,m.z-p.z)<.015,dock.id+' actual seam traversal');pos=m;
    }
  }
});
test('cape joins grade only dry border terrain and preserve source water crossings',()=>{
  const hf=world.heightfield,city=data.world.city;
  assert.ok(Math.abs(world.terrainY(16,125.5)-hf.heightAt(16,125.5))<.04,'dry source edge meets native terrain');
  assert.equal(world.terrainY(40,104),.76,'approved source causeway above native water stays raised');
  assert.equal(world.terrainY(62,30),.76,'city interior remains authored');
  const road=data.world.roads.find(r=>r.id==='city_cape_path_join');assert.equal(road.width,2.2);
  let p={x:road.points[0][0],z:road.points[0][1]};
  for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1);
    for(let k=1;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,m=world.move(p.x,p.z,.45,x-p.x,z-p.z);assert.ok(Math.hypot(m.x-x,m.z-z)<.02,'cape dirt join stays clear');p=m;}
  }
});
