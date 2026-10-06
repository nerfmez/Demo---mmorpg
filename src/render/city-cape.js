// Grade only the approved cape surface ends onto native dry terrain.
// Source files and XZ silhouettes are unchanged; work is done once at load.
import * as THREE from 'three';
import { drainSteps } from './city-work.js';
import { cityBoundsSteps, finishCityTrianglesSteps } from './city-geometry.js';
import {cityFloorHeight} from '../core/city.js';
import {pointInPolygon,distToSegment} from '../core/math.js';

function clip(poly,axis,limit,positive){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-limit)*(positive?1:-1),db=(b[axis]-limit)*(positive?1:-1);
    if(da>=0)out.push(a);
    if((da<0&&db>0)||(da>0&&db<0))out.push(a.clone().lerp(b,da/(da-db)));
  }
  return out;
}
const landCache=new WeakMap(),capeCache=new WeakMap();
function landTriangles(world,cape=false){
  const cache=cape?capeCache:landCache;
  if(cache.has(world))return cache.get(world);
  // Landward wall repairs leave the cape contour unchanged. Keep its original
  // triangulation so northern wall vertices cannot retessellate distant roads.
  const f=(cape&&world.data.city.propertyBoundary?.previousPaving)||world.data.city.floors[0],shape=new THREE.Shape(f.points.map(p=>new THREE.Vector2(...p)));
  shape.holes=(f.holes||[]).map(h=>new THREE.Path(h.map(p=>new THREE.Vector2(...p))));
  const g=new THREE.ShapeGeometry(shape),pos=g.attributes.position,idx=g.index,out=[];
  for(let i=0;i<idx.count;i+=3)out.push([0,1,2].map(k=>new THREE.Vector2(pos.getX(idx.getX(i+k)),pos.getY(idx.getX(i+k)))));
  g.dispose();cache.set(world,out);return out;
}
function insideTriangle(poly,triangle){
  const [a,b,c]=triangle,sign=Math.sign((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  for(let i=0;i<3&&poly.length;i++){
    const a=triangle[i],b=triangle[(i+1)%3],out=[];
    const d=p=>sign*((b.x-a.x)*(p.z-a.y)-(b.y-a.y)*(p.x-a.x));
    for(let j=0;j<poly.length;j++){
      const p=poly[j],q=poly[(j+1)%poly.length],dp=d(p),dq=d(q);
      if(dp>=-1e-7)out.push(p);
      if((dp<0&&dq>0)||(dp>0&&dq<0))out.push(p.clone().lerp(q,dp/(dp-dq)));
    }
    poly=out;
  }
  return poly;
}

// Clip real geometry to the same source-derived property footprint used by
// collision/terrain coverage. A colour mask would leave the old slab walkable.
// Mainland is one flat top; road triangles keep their authored height/curves.
export function trimCityPaving(...args){return drainSteps(trimCityPavingSteps(...args));}
export function* trimCityPavingSteps(mesh,world,root){
  const old=mesh.geometry,inverse=mesh.matrixWorld.clone().invert(),vertices=[];
  const emit=poly=>{
    for(let i=1;i<poly.length-1;i++){
      const a=poly[0],b=poly[i],c=poly[i+1];
      if(Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))<1e-8)continue;
      for(const p of [a,b,c]){
        const q=p.clone().sub(root.position).applyMatrix4(inverse);vertices.push(q.x,q.y,q.z);
      }
    }
  };
  const floor=world.data.city.floors[0],loops=[floor.points,...floor.holes||[]],land=landTriangles(world);
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const supported=p=>{
    if(pointInPolygon(floor.points,p.x,p.z)&&!(floor.holes||[]).some(h=>pointInPolygon(h,p.x,p.z)))return true;
    // Source metadata is rounded to five decimals; GLB vertices are float32.
    return loops.some(l=>l.some((a,i)=>distToSegment(p.x,p.z,...a,...l[(i+1)%l.length]).d<.0001));
  };
  const contained=tri=>{
    if(!tri.every(supported))return false;
    for(const loop of loops)for(let i=0;i<loop.length;i++){
      const p={x:loop[i][0],z:loop[i][1]},q={x:loop[(i+1)%loop.length][0],z:loop[(i+1)%loop.length][1]};
      const signs=tri.map((a,k)=>cross(a,tri[(k+1)%3],p)/Math.hypot(tri[(k+1)%3].x-a.x,tri[(k+1)%3].z-a.z));
      // Includes a hole/concavity completely enclosed by the triangle.
      if(signs.every(s=>s>.0001)||signs.every(s=>s< -.0001))return false;
      for(let k=0;k<3;k++){
        const a=tri[k],b=tri[(k+1)%3];
        const ab=Math.hypot(b.x-a.x,b.z-a.z),pq=Math.hypot(q.x-p.x,q.z-p.z);
        const ap=cross(a,b,p)/ab,aq=cross(a,b,q)/ab,pa=cross(p,q,a)/pq,pb=cross(p,q,b)/pq;
        if(ap*aq<0&&pa*pb<0&&Math.min(Math.abs(ap),Math.abs(aq),Math.abs(pa),Math.abs(pb))>.0001)return false;
      }
    }
    return true;
  };
  const pos=old.attributes.position,idx=old.index,count=idx?.count??pos.count;
  const bounds=land.map(t=>[Math.min(...t.map(p=>p.x)),Math.max(...t.map(p=>p.x)),Math.min(...t.map(p=>p.y)),Math.max(...t.map(p=>p.y))]);
  for(let i=0;i<count;i+=3){
    if(i%96===0)yield;
    const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld).add(root.position));
    // Keep contained source triangles intact. Repartitioning every street by
    // every land triangle needlessly doubled tessellation (and repeated cape trim).
    if(contained(tri)){emit(tri);continue;}
    const x0=Math.min(...tri.map(p=>p.x)),x1=Math.max(...tri.map(p=>p.x)),z0=Math.min(...tri.map(p=>p.z)),z1=Math.max(...tri.map(p=>p.z));
    for(let j=0;j<land.length;j++){
      if(j%64===0)yield;
      const b=bounds[j];if(x1<b[0]||x0>b[1]||z1<b[2]||z0>b[3])continue;
      emit(insideTriangle(tri,land[j]));
    }
  }
  const g=yield* finishCityTrianglesSteps(vertices);mesh.geometry=g;if(!old.userData.shared)old.dispose();
}
export function gradeCapeMesh(...args){return drainSteps(gradeCapeMeshSteps(...args));}
export function* gradeCapeMeshSteps(mesh,world,root,floor,trimRoad=false){
  const bounds=world.data.city.capeTransition.bounds,old=mesh.geometry;
  yield* cityBoundsSteps(old, false);
  const box=old.boundingBox.clone().applyMatrix4(mesh.matrixWorld).translate(root.position);
  if(box.min.x>bounds[1]||box.max.z<bounds[2])return;
  const pos=old.attributes.position,idx=old.index,count=idx?.count??pos.count,vertices=[],inverse=mesh.matrixWorld.clone().invert();
  let emitted=0;
  const emit=function*(a,b,c,grade){
    if(++emitted%64===0)yield;
    if(grade){
      const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a);
      if(Math.max(ab,bc,ca)>9){
        if(ab>=bc&&ab>=ca){const m=a.clone().lerp(b,.5);yield* emit(a,m,c,true);yield* emit(m,b,c,true);}
        else if(bc>=ca){const m=b.clone().lerp(c,.5);yield* emit(a,b,m,true);yield* emit(a,m,c,true);}
        else{const m=c.clone().lerp(a,.5);yield* emit(a,b,m,true);yield* emit(m,b,c,true);}return;
      }
    }
    for(const p of [a,b,c]){
      const q=p.clone();if(grade)q.y+=cityFloorHeight(world.data.city,world.heightfield,q.x,q.z,floor)-floor.height;
      q.sub(root.position).applyMatrix4(inverse);vertices.push(q.x,q.y,q.z);
    }
  };
  const fan=function*(p,grade){for(let i=1;i<p.length-1;i++)yield* emit(p[0],p[i],p[i+1],grade);};
  for(let i=0;i<count;i+=3){
    if(i%96===0)yield;
    const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld).add(root.position));
    // Partition along the cape review bounds; preserve every triangle outside.
    yield* fan(clip(tri,'z',bounds[2],false),false);
    const south=clip(tri,'z',bounds[2],true);if(south.length<3)continue;
    yield* fan(clip(south,'x',bounds[1],true),false);
    const cape=clip(south,'x',bounds[1],false);
    // A few source road triangles protruded past solid land. Keep their exact
    // source centerline but trim those unsupported render edges to its footprint.
    if(trimRoad)for(const land of landTriangles(world,true)){yield* fan(insideTriangle(cape,land),true);yield;}
    else yield* fan(cape,true);
  }
  const g=yield* finishCityTrianglesSteps(vertices);
  mesh.geometry=g;if(!old.userData.shared)old.dispose();
}
