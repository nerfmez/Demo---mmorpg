// Grade only the approved cape surface ends onto native dry terrain.
// Source files and XZ silhouettes are unchanged; work is done once at load.
import * as THREE from 'three';
import {cityFloorHeight} from '../core/city.js';

function clip(poly,axis,limit,positive){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-limit)*(positive?1:-1),db=(b[axis]-limit)*(positive?1:-1);
    if(da>=0)out.push(a);
    if((da<0&&db>0)||(da>0&&db<0))out.push(a.clone().lerp(b,da/(da-db)));
  }
  return out;
}
const landCache=new WeakMap();
function landTriangles(world){
  if(landCache.has(world))return landCache.get(world);
  const f=world.data.city.floors[0],shape=new THREE.Shape(f.points.map(p=>new THREE.Vector2(...p)));
  shape.holes=(f.holes||[]).map(h=>new THREE.Path(h.map(p=>new THREE.Vector2(...p))));
  const g=new THREE.ShapeGeometry(shape),pos=g.attributes.position,idx=g.index,out=[];
  for(let i=0;i<idx.count;i+=3)out.push([0,1,2].map(k=>new THREE.Vector2(pos.getX(idx.getX(i+k)),pos.getY(idx.getX(i+k)))));
  g.dispose();landCache.set(world,out);return out;
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
export function gradeCapeMesh(mesh,world,root,floor,trimRoad=false){
  const bounds=world.data.city.capeTransition.bounds,old=mesh.geometry;
  old.computeBoundingBox();
  const box=old.boundingBox.clone().applyMatrix4(mesh.matrixWorld).translate(root.position);
  if(box.min.x>bounds[1]||box.max.z<bounds[2])return;
  const pos=old.attributes.position,idx=old.index,count=idx?.count??pos.count,vertices=[],inverse=mesh.matrixWorld.clone().invert();
  const emit=(a,b,c,grade)=>{
    if(grade){
      const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a);
      if(Math.max(ab,bc,ca)>9){
        if(ab>=bc&&ab>=ca){const m=a.clone().lerp(b,.5);emit(a,m,c,true);emit(m,b,c,true);}
        else if(bc>=ca){const m=b.clone().lerp(c,.5);emit(a,b,m,true);emit(a,m,c,true);}
        else{const m=c.clone().lerp(a,.5);emit(a,b,m,true);emit(m,b,c,true);}return;
      }
    }
    for(const p of [a,b,c]){
      const q=p.clone();if(grade)q.y+=cityFloorHeight(world.data.city,world.heightfield,q.x,q.z,floor)-floor.height;
      q.sub(root.position).applyMatrix4(inverse);vertices.push(q.x,q.y,q.z);
    }
  };
  const fan=(p,grade)=>{for(let i=1;i<p.length-1;i++)emit(p[0],p[i],p[i+1],grade);};
  for(let i=0;i<count;i+=3){
    const tri=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld).add(root.position));
    // Partition along the cape review bounds; preserve every triangle outside.
    fan(clip(tri,'z',bounds[2],false),false);
    const south=clip(tri,'z',bounds[2],true);if(south.length<3)continue;
    fan(clip(south,'x',bounds[1],true),false);
    const cape=clip(south,'x',bounds[1],false);
    // A few source road triangles protruded past solid land. Keep their exact
    // source centerline but trim those unsupported render edges to its footprint.
    if(trimRoad)for(const land of landTriangles(world))fan(insideTriangle(cape,land),true);
    else fan(cape,true);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();g.computeBoundingSphere();
  mesh.geometry=g;old.dispose();
}
