// Continuous source-footprint retaining faces. Native terrain/coast are untouched.
import * as THREE from 'three';
import {finishSteps} from './build-queue.js';
import {finishGeometrySteps} from './geometry-steps.js';
import {toon} from './toon.js';
import {cityFloorHeight} from '../core/city.js';
import {pointInPolygon} from '../core/math.js';

export const bankGeometry=(...args)=>finishSteps(bankGeometrySteps(...args));
export function* bankGeometrySteps(world,offset,owner){
  const faces=[],caps=[],segments=[],city=world.data.city;
  const emit=(target,points)=>{for(const p of points)target.push(p[0]-offset[0],p[1]-offset[1],p[2]-offset[2]);};
  for(const [floorIndex,floor]of city.floors.slice(0,2).entries()){
    const supported=(x,z)=>pointInPolygon(floor.points,x,z)&&!(floor.holes||[]).some(h=>pointInPolygon(h,x,z));
    for(const [loopIndex,loop]of [floor.points,...floor.holes||[]].entries()){
      const inward=loop.map((a,i)=>{
        const b=loop[(i+1)%loop.length],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);
        let nx=-dz/d,nz=dx/d;
        if(!supported((a[0]+b[0])/2+nx*.02,(a[1]+b[1])/2+nz*.02)){nx=-nx;nz=-nz;}
        return [nx,nz];
      });
      const inner=loop.map((a,i)=>{
        const p=inward[(i+loop.length-1)%loop.length],q=inward[i],nx=p[0]+q[0],nz=p[1]+q[1],den=nx*q[0]+nz*q[1];
        const t=Math.min(.36,.18/Math.max(.5,den));return [a[0]+nx*t,a[1]+nz*t];
      });
      for(let i=0;i<loop.length;i++){
        yield;
        const a=loop[i],b=loop[(i+1)%loop.length],ia=inner[i],ib=inner[(i+1)%loop.length],cape=city.capeTransition.bounds;
        const nearCape=Math.min(a[0],b[0])<=cape[1]&&Math.max(a[0],b[0])>=cape[0]&&Math.max(a[1],b[1])>=cape[2]&&Math.min(a[1],b[1])<=cape[3];
        const n=nearCape?Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5):1,breaks=Array.from({length:n+1},(_,k)=>k/n);
        // Split exactly at other floor boundaries. Lower hidden walls are removed;
        // a raised island's interior edge is only a riser to the lower paving.
        for(const other of city.floors.slice(0,2))if(other!==floor)for(const ring of [other.points,...other.holes||[]])for(let j=0;j<ring.length;j++){
          const p=ring[j],q=ring[(j+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],ex=q[0]-p[0],ez=q[1]-p[1],den=dx*ez-dz*ex;
          if(Math.abs(den)<1e-9)continue;
          const t=((p[0]-a[0])*ez-(p[1]-a[1])*ex)/den,u=((p[0]-a[0])*dz-(p[1]-a[1])*dx)/den;
          if(t>1e-7&&t<1-1e-7&&u>=0&&u<=1)breaks.push(t);
        }
        breaks.sort((a,b)=>a-b);
        for(let k=0;k<breaks.length-1;k++){
          if(k&&k%16===0)yield;
          const t0=breaks[k],t1=breaks[k+1];if(t1-t0<1e-8)continue;
          const mx=a[0]+(b[0]-a[0])*(t0+t1)/2,mz=a[1]+(b[1]-a[1])*(t0+t1)/2;
          const covering=city.floors.slice(0,2).find(other=>other!==floor&&pointInPolygon(other.points,mx,mz)&&!(other.holes||[]).some(h=>pointInPolygon(h,mx,mz)));
          if(covering&&covering.height>=floor.height)continue;
          const x0=a[0]+(b[0]-a[0])*t0,z0=a[1]+(b[1]-a[1])*t0,x1=a[0]+(b[0]-a[0])*t1,z1=a[1]+(b[1]-a[1])*t1;
          const y0=cityFloorHeight(city,world.heightfield,x0,z0,floor),y1=cityFloorHeight(city,world.heightfield,x1,z1,floor);
          const lo0=covering?Math.min(y0-.001,cityFloorHeight(city,world.heightfield,x0,z0,covering)):Math.min(world.heightfield.heightAt(x0,z0)-.15,world.waterLevel-1),lo1=covering?Math.min(y1-.001,cityFloorHeight(city,world.heightfield,x1,z1,covering)):Math.min(world.heightfield.heightAt(x1,z1)-.15,world.waterLevel-1);
          const top0=[x0,y0,z0],top1=[x1,y1,z1],bottom0=[x0,lo0,z0],bottom1=[x1,lo1,z1];
          // Both triangles face away from supported land. Double-side rendering
          // also covers views from pier entries; no alternating inverted quads.
          const points=inward[i][0]*(z1-z0)-inward[i][1]*(x1-x0)<0?[top0,top1,bottom0,top1,bottom1,bottom0]:[top1,top0,bottom0,bottom1,top1,bottom0];
          emit(faces,points);
          const cap0=[ia[0]+(ib[0]-ia[0])*t0,y0+.006,ia[1]+(ib[1]-ia[1])*t0],cap1=[ia[0]+(ib[0]-ia[0])*t1,y1+.006,ia[1]+(ib[1]-ia[1])*t1];
          emit(caps,inward[i][0]*(z1-z0)-inward[i][1]*(x1-x0)<0?[top0,cap0,top1,top1,cap0,cap1]:[top1,cap0,top0,cap1,cap0,top1]);
          segments.push({floor:floorIndex,loop:loopIndex,edge:i,riser:!!covering,a:top0,b:top1,bottom:[lo0,lo1]});
        }
      }
    }
  }
  const geometry=function*(values){const g=new THREE.BufferGeometry();owner?.geometry(g);g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));return yield* finishGeometrySteps(g,true);};
  return {face:yield* geometry(faces),cap:yield* geometry(caps),segments};
}

export const cityBank=(...args)=>finishSteps(cityBankSteps(...args));
export function* cityBankSteps(world,root,owner){
  const bank=yield* bankGeometrySteps(world,root.position.toArray(),owner);
  const face=new THREE.Mesh(bank.face,toon('#939b8c',{side:THREE.DoubleSide}));face.name='continuous-city-retaining-bank';face.receiveShadow=true;
  const cap=new THREE.Mesh(bank.cap,toon('#b9b29a',{side:THREE.DoubleSide}));cap.name='continuous-city-bank-top-transition';cap.receiveShadow=true;
  root.add(face,cap);
  return {segments:bank.segments.length,triangles:(bank.face.attributes.position.count+bank.cap.attributes.position.count)/3,loops:3};
}
