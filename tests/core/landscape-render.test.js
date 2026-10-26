import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {landscapeSteps} from '../../src/render/landscape.js';
import {disposeObject} from '../../src/render/dispose.js';

test('landscape cells have bounded finite buffers and release every owned geometry/material once',()=>{
  const world=createWorld(loadData().maps['frontier-wilds-v1']);
  let previous;
  for(let cycle=0;cycle<2;cycle++){
    let root;const steps=landscapeSteps(world,{adopt:r=>root=r});while(!steps.next().done){}
    const geometry=new Set(),material=new Set();let vertices=0;
    root.traverse(o=>{
      if(!o.isMesh)return;geometry.add(o.geometry);material.add(o.material);
      assert.ok(o.geometry.boundingSphere.radius<25,'bounded spatial cell');
      const p=o.geometry.attributes.position;vertices+=p.count;
      for(const value of p.array)assert.ok(Number.isFinite(value));
    });
    assert.ok(vertices>1000&&geometry.size>10);assert.ok(material.size<=5);
    const counts={geometries:geometry.size,materials:material.size,vertices};
    if(previous)assert.deepEqual(counts,previous,'rebuild is deterministic and bounded');previous=counts;
    const disposed=new Map();for(const r of[...geometry,...material])r.addEventListener('dispose',()=>disposed.set(r,(disposed.get(r)||0)+1));
    disposeObject(root);for(const r of[...geometry,...material])assert.equal(disposed.get(r),1,'region owns each resource exactly once');
  }
});
