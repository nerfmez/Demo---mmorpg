import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRng} from '../../src/core/rng.js';

// The generated scenes measure outline distances from a grid of candidate edges
// (scripts/prepare-accepted-scenes.py). It must give exactly what looping over every edge gives.
const src=readFileSync(new URL('../../src/render/accepted-scenes/gull-headland.js',import.meta.url),'utf8');
const start=src.indexOf('const POLY_GRIDS'),end=src.indexOf('\n}\n',src.indexOf('function polyAt('))+3;
const fast=new Function(src.slice(start,end)+'\nreturn polyAt;')();
function slow(T,x,z){
 if(x<T.minX-3||x>T.maxX+3||z<T.minZ-3||z>T.maxZ+3)return null;
 const p=T.pts;let best=Infinity,inside=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++){
  const a=p[j],b=p[i];
  if((b.z>z)!==(a.z>z)&&x<(a.x-b.x)*(z-b.z)/(a.z-b.z)+b.x)inside=!inside;
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  const ex=a.x+dx*t-x,ez=a.z+dz*t-z,e2=ex*ex+ez*ez;
  if(e2<best){best=e2;slow.wall=a.wall;}
 }
 return inside?-Math.sqrt(best):Math.sqrt(best);
}

test('the gridded outline distance equals the full loop, value and nearest wall',()=>{
 const rng=createRng(7).next;
 for(let shape=0;shape<12;shape++){
  // a wobbly outline with uneven spacing, a repeated point and some cliff edges
  const n=8+Math.floor(rng()*90),cx=rng()*200-100,cz=rng()*200-100,r=4+rng()*40,pts=[];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,k=r*(.6+.5*rng());pts.push({x:cx+Math.cos(a)*k,z:cz+Math.sin(a)*k*(.4+rng()),wall:rng()<.4?1:0});}
  pts.splice(3,0,{...pts[3]});
  const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z);
  const T={pts,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
  for(let i=0;i<4000;i++){
   const x=T.minX-4+rng()*(T.maxX-T.minX+8),z=T.minZ-4+rng()*(T.maxZ-T.minZ+8);
   const want=slow(T,x,z),got=fast(T,x,z);
   assert.equal(got,want,`shape ${shape} at ${x},${z}`);
   if(want!==null)assert.equal(fast.wall,slow.wall,`nearest wall, shape ${shape} at ${x},${z}`);
  }
 }
});
