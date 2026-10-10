import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {finishSteps} from '../../src/render/build-queue.js';
import {edgeGeometrySteps,finishGeometrySteps,transformGeometrySteps,mergeGeometrySteps} from '../../src/render/geometry-steps.js';
import {boxBlur,rasterPolyline} from '../../src/core/terrain.js';
import {boxBlurSteps,rasterPolylineSteps} from '../../src/render/ground-work.js';
import {ownsRegionPoint,clipRegionGeometrySteps} from '../../src/render/region-ownership.js';
import {groundBrushUniformSteps} from '../../src/render/ground-brush.js';

const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const equalAttributes=(a,b)=>{assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));for(const key in a.attributes)assert.deepEqual(bytes(a.attributes[key].array),bytes(b.attributes[key].array),key);};

test('incremental edges equal Three.js indexed/nonindexed output and threshold order',()=>{
  for(const g of [new THREE.BoxGeometry(),new THREE.SphereGeometry(1,32,20),new THREE.PlaneGeometry(3,4,40,20)])for(const geometry of [g,g.toNonIndexed()])for(const angle of [1,25,80]){
    const expected=new THREE.EdgesGeometry(geometry,angle),actual=finishSteps(edgeGeometrySteps(geometry,angle));equalAttributes(actual,expected);actual.dispose();expected.dispose();
  }
});

test('incremental flat normals, bounds, transforms and concatenation retain every Float32 value',()=>{
  const a=new THREE.SphereGeometry(3,64,40).toNonIndexed(),b=a.clone();
  a.computeVertexNormals();a.computeBoundingBox();a.computeBoundingSphere();finishSteps(finishGeometrySteps(b,true));equalAttributes(a,b);
  assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(34,2,-100),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.6,.9)),new THREE.Vector3(1,2,.8));
  a.applyMatrix4(matrix);finishSteps(transformGeometrySteps(b,matrix));equalAttributes(a,b);
  equalAttributes(mergeGeometries([a,a]),finishSteps(mergeGeometrySteps([b,b])));
  const padded=b.boundingSphere.clone();padded.radius+=7;b.boundingSphere=padded;finishSteps(finishGeometrySteps(b,false,false));assert.equal(b.boundingSphere,padded,'bbox-only must preserve shader displacement padding');
});

test('cancelling a suspended merge frees only the unfinished result',()=>{
  const part=new THREE.BoxGeometry(1,1,1,16,16,16).toNonIndexed(),resources=[],freed=[];
  const owner={geometry:g=>resources.push(g),release:g=>{freed.push(g);g.dispose();}};
  const steps=mergeGeometrySteps([part,part],owner);assert.equal(steps.next().done,false);steps.return();
  assert.equal(resources.length,1);assert.deepEqual(freed,resources);assert.notEqual(freed[0],part);
});

test('incremental paint raster/blur preserve original visit order and bytes',()=>{
  const w=67,h=49,src=Float32Array.from({length:w*h},(_,i)=>Math.sin(i*.3)*.4+i%7);
  for(const radius of [1,4,6])assert.deepEqual(bytes(boxBlur(src,w,h,radius)),bytes(finishSteps(boxBlurSteps(src,w,h,radius))));
  const grid={w,h,ox:-10,oz:-20,res:.5},path=[[-12,-19],[8,-7],[18,-11],[0,5]],a=[],b=[];
  const expected=rasterPolyline(grid,path,3,(...args)=>a.push(args)),actual=finishSteps(rasterPolylineSteps(grid,path,3,(...args)=>b.push(args)));
  assert.equal(actual,expected);assert.deepEqual(b,a);
});

test('resident paint blur avoids per-column row yields while retaining exact colours and bounded chunks',()=>{
  for(const [w,h]of [[451,381],[513,2049]]){
    const src=Float32Array.from({length:w*h},(_,i)=>Math.sin(i*.3)*.4+i%7),steps=boxBlurSteps(src,w,h,6);
    let count=0,result;for(;;){const step=steps.next();if(step.done){result=step.value;break;}count++;}
    assert.deepEqual(bytes(result),bytes(boxBlur(src,w,h,6)),'every Float32 paint sample stays identical');
    assert.ok(count<=Math.ceil(h/Math.max(1,Math.min(8,Math.floor(4096/w))))+Math.ceil(w/Math.max(1,Math.min(8,Math.floor(4096/h)))),'only bounded row/column groups schedule construction');
    if(w===451)assert.equal(count,105,'a native Azure blur pass no longer yields 21,753 times');
    else assert.ok(count>h/8+w/8,'large columns retain a smaller construction chunk');
  }
});

const region={bounds:{minX:0},seams:[{edge:'minX',alongX:false,outward:-1,span:[-2,2]}]};
function area(g){const p=g.attributes.position,idx=g.index;let n=0;for(let i=0;i<(idx?idx.count:p.count);i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k));n+=new THREE.Triangle(...v).getArea();}return n;}
test('water/terrain ownership is the entire shared edge, including closed seam ends',()=>{
  for(const z of [-100,-2,0,2,100]){assert.equal(ownsRegionPoint(region,-.01,z),false);assert.equal(ownsRegionPoint(region,.01,z),true);}
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-2,0,90, 2,0,90, 2,0,94],3));
  geometry.setAttribute('wash',new THREE.Float32BufferAttribute([0,1,1],1));
  let freed=0;geometry.addEventListener('dispose',()=>freed++);
  const clipped=finishSteps(clipRegionGeometrySteps(geometry,region));assert.equal(freed,1);assert.equal(area(clipped),6);
  const p=clipped.attributes.position,w=clipped.attributes.wash;for(let i=0;i<p.count;i++){assert.ok(p.getX(i)>=0);assert.equal(w.getX(i),(p.getX(i)+2)/4);}
});

test('geometry partition has neither an overlapping triangle nor a gap',()=>{
  const source=new THREE.PlaneGeometry(8,10,4,5).rotateX(-Math.PI/2);
  const other={bounds:{maxX:0},seams:[{edge:'maxX',alongX:false,outward:1,span:[-2,2]}]};
  const a=finishSteps(clipRegionGeometrySteps(source.clone(),region)),b=finishSteps(clipRegionGeometrySteps(source.clone(),other));
  assert.equal(area(a)+area(b),area(source));for(let i=0;i<a.attributes.position.count;i++)assert.ok(a.attributes.position.getX(i)>=0);for(let i=0;i<b.attributes.position.count;i++)assert.ok(b.attributes.position.getX(i)<=0);
  const inside=new THREE.BoxGeometry().translate(3,0,0);assert.equal(finishSteps(clipRegionGeometrySteps(inside,region)),inside);
  const outside=new THREE.BoxGeometry().translate(-3,0,0);assert.equal(finishSteps(clipRegionGeometrySteps(outside,region)).index.count,0);
});

test('interleaved ground atlas users share one result; one cancellation cannot invalidate the other',()=>{
  const a=new THREE.MeshBasicMaterial(),b=new THREE.MeshBasicMaterial(),sa=groundBrushUniformSteps(a),sb=groundBrushUniformSteps(b);
  for(let i=0;i<20;i++){assert.equal(sa.next().done,false);assert.equal(sb.next().done,false);}
  sa.return();const tb=finishSteps(sb).value;
  const c=new THREE.MeshBasicMaterial(),tc=finishSteps(groundBrushUniformSteps(c)).value;assert.equal(tc,tb);
  let disposed=0;tb.addEventListener('dispose',()=>disposed++);b.dispose();assert.equal(disposed,0);c.dispose();assert.equal(disposed,1);a.dispose();assert.equal(disposed,1);
});
