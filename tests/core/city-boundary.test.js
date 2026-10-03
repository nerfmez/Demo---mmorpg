import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {cityFloorAt,cityRoadDistance} from '../../src/core/city.js';
import {outsideClearingWeight} from '../../src/core/ground-regions.js';
import {fromBoxLocal} from '../../src/core/math.js';

const data=loadData(),city=data.world.city,world=createWorld(data.world),repair=city.propertyBoundary;
test('paving ends at landward source walls; the gate uses native earth outside',()=>{
  for(const [x,z]of[[0,-65],[80,-65],[120,-40],[150,-30],[163,30]])assert.equal(cityFloorAt(city,x,z),null,'no old slab at '+[x,z]);
  assert.ok(cityFloorAt(city,80,-40),'gate interior remains paved');
  assert.equal(world.terrainY(80,-65),world.heightfield.heightAt(80,-65));
  for(const wall of city.colliders.filter(c=>c.id.startsWith('City limestone wall'))){
    const sides=[-1,1].map(sign=>fromBoxLocal(wall,sign*(wall.hx+.1),0));
    assert.equal(sides.filter(p=>cityFloorAt(city,p.x,p.z)).length,1,wall.id+' one paved side only');
  }
  assert.equal(city.dressing.placements.length,248);
});
test('five relocated whole trees have canopy, planter and walking clearance',()=>{
  assert.equal(repair.treeRelocations.length,5);assert.equal(data.world.town.trees.length,11);
  const empty=createWorld({...data.world,town:{...data.world.town,trees:[]}});
  for(const m of repair.treeRelocations){
    const t=data.world.town.trees.find(t=>t.id===m.id);
    assert.deepEqual([t.x,t.z],m.next);assert.ok(cityFloorAt(city,t.x,t.z,2.15));
    assert.ok(cityRoadDistance(city,t.x,t.z)>=repair.treeClearance.minimumStreetEdge);
    assert.ok(repair.treeClearance.minimumStreetEdge>=repair.treeClearance.canopyEnvelope+.6);
    assert.ok(empty.isFree(t.x,t.z,2.15),m.id+' full planting pocket');
    assert.ok(city.entries.every(e=>Math.hypot(e.x-t.x,e.z-t.z)>=3.3),m.id+' entrance clearance');
  }
});
test('boundary clipping does not reshuffle existing native trees or core decoration',()=>{
  const before=structuredClone(data.world);before.city.floors[0]=repair.previousPaving;
  for(const t of before.town.trees){const m=repair.treeRelocations.find(m=>m.id===t.id);if(m)[t.x,t.z]=m.old;}
  delete before.city.propertyBoundary;delete before.city.outsideClearings;
  const old=createWorld(before);
  assert.deepEqual(world.decor,old.decor);
  assert.deepEqual(world.circles.filter(c=>!c.id?.startsWith('courtyard_tree_')),old.circles.filter(c=>!c.id?.startsWith('courtyard_tree_')));
  assert.deepEqual(world.heightfield.data,old.heightfield.data);
});
test('organic clearing contains real walkable play pockets and retained islands',()=>{
  assert.equal(city.outsideClearings.length,5);
  assert.ok(outsideClearingWeight(city,72,-79)>.9,'broad existing trail junction');
  assert.ok(outsideClearingWeight(city,79,-54)>.9,'gate neck');
  assert.equal(outsideClearingWeight(city,59.5,-74.08),0,'retain actual native tree island');
  assert.equal(outsideClearingWeight(city,79,-74),0,'retain interior grass island');
  assert.equal(outsideClearingWeight(city,0,0),0,'bounded prototype');
  let p={x:79.5,z:-40};
  for(const target of[[79.5,-52],[79,-59],[76,-64],[73,-70],[72,-79],[70.728433,-79.374601]]){
    const a={...p},n=Math.ceil(Math.hypot(target[0]-p.x,target[1]-p.z)/.05);
    for(let i=1;i<=n;i++){
      const x=a.x+(target[0]-a.x)*i/n,z=a.z+(target[1]-a.z)*i/n,m=world.move(p.x,p.z,.45,x-p.x,z-p.z);
      assert.ok(Math.hypot(m.x-x,m.z-z)<.015,'gate to existing junction traversal '+[x,z]);p=m;
    }
  }
});

test('outside ground connects existing destinations while retaining native tree islands',()=>{
  assert.deepEqual(data.world.waypoints.map(w=>w.id),['landing','town','meadow','forest','headland']);
  for(const [id,x,z]of[['meadow',-21,-35],['forest',-100,-43],['headland',186,-90]]){
    assert.ok(outsideClearingWeight(city,x,z)>.85,id+' actual waypoint uses earth clearing');
    assert.ok([[x-2,z],[x+2,z],[x,z-2],[x,z+2]].some(p=>world.isFree(...p,.45)),id+' actual waypoint approach stays free');
  }
  for(const r of city.outsideClearings)for(const [x,z]of r.retainedTreeIslands||[])
    assert.equal(outsideClearingWeight(city,x,z),0,r.id+' retained native vegetation island');
  assert.equal(outsideClearingWeight(city,0,-116),0,'obsolete destinationless north stub');
  assert.equal(outsideClearingWeight(city,180,36),0,'retired old exterior warehouse spur');
});
