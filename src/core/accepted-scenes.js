// Pure sampled layout exported from the accepted scene factories. Rendering,
// collision, path painting and the Godot export all consume the same coordinates.
import layout from '../../data/accepted-scenes.js';
import {distToPolyline} from './math.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function acceptedScenes(data){return data.acceptedScenes?.enabled?layout.scenes:[];}
export function sceneWeight(scene,x,z){
 const b=scene.bounds,d=Math.min(x-b[0],b[1]-x,z-b[2],b[3]-z);
 return smooth(d/scene.feather);
}
export function acceptedAt(data,x,z){
 for(const scene of acceptedScenes(data))if(sceneWeight(scene,x,z)>0)return scene;
 return null;
}
export function sceneSample(scene,key,x,z){
 const g=scene.grid,fx=Math.max(0,Math.min(g.w-1.00001,(x-g.ox)/g.res)),fz=Math.max(0,Math.min(g.h-1.00001,(z-g.oz)/g.res));
 const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*g.w+i,a=scene[key];
 return a[k]*(1-u)*(1-v)+a[k+1]*u*(1-v)+a[k+g.w]*(1-u)*v+a[k+g.w+1]*u*v;
}
export function applyAcceptedHeights(data,grid,heights){
 for(const scene of acceptedScenes(data)){
  const b=scene.bounds;
  for(let j=Math.max(0,Math.floor((b[2]-grid.oz)/grid.res));j<=Math.min(grid.h-1,Math.ceil((b[3]-grid.oz)/grid.res));j++)
   for(let i=Math.max(0,Math.floor((b[0]-grid.ox)/grid.res));i<=Math.min(grid.w-1,Math.ceil((b[1]-grid.ox)/grid.res));i++){
    const x=grid.ox+i*grid.res,z=grid.oz+j*grid.res,w=sceneWeight(scene,x,z),k=j*grid.w+i;
    heights[k]+=(sceneSample(scene,'heights',x,z)-heights[k])*w;
   }
 }
 // Authored connector profiles recover the native road at their far ends.
 for(const road of data.acceptedScenes?.connectors||[]){
  const xs=road.points.map(p=>p[0]),zs=road.points.map(p=>p[1]),pad=road.width/2+2.5;
  const i0=Math.max(0,Math.floor((Math.min(...xs)-pad-grid.ox)/grid.res)),i1=Math.min(grid.w-1,Math.ceil((Math.max(...xs)+pad-grid.ox)/grid.res));
  const j0=Math.max(0,Math.floor((Math.min(...zs)-pad-grid.oz)/grid.res)),j1=Math.min(grid.h-1,Math.ceil((Math.max(...zs)+pad-grid.oz)/grid.res));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const x=grid.ox+i*grid.res,z=grid.oz+j*grid.res;
   let best=Infinity,y=0;
   for(let n=0;n<road.points.length-1;n++){
    const a=road.points[n],b=road.points[n+1],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(l||1))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    if(d<best){best=d;y=road.heights[n]+(road.heights[n+1]-road.heights[n])*t;}
   }
   const w=1-smooth((best-road.width/2)/2.5),k=j*grid.w+i;if(w>0)heights[k]+=(y-heights[k])*w;
  }
 }
}
export function smoothAcceptedAprons(data,grid,heights){
 const repairs=(data.acceptedScenes?.connectors||[]).filter(r=>r.repair);if(!repairs.length)return;
 const cells=[];for(let j=1;j<grid.h-1;j++)for(let i=1;i<grid.w-1;i++)if(repairs.some(r=>distToPolyline(grid.ox+i*grid.res,grid.oz+j*grid.res,r.points)<r.width/2+2.5))cells.push(j*grid.w+i);
 for(let pass=0;pass<5;pass++){const old=heights.slice();for(const k of cells)heights[k]=old[k]*.2+(old[k-1]+old[k+1]+old[k-grid.w]+old[k+grid.w])*.2;}
}
export function suppressNativeSceneProp(data,x,z,pad=0){
 return acceptedScenes(data).some(s=>sceneWeight(s,x,z)>.02&&Math.min(x-s.bounds[0],s.bounds[1]-x,z-s.bounds[2],s.bounds[3]-z)>pad);
}
export function connectorClear(data,x,z,pad=0){
 return (data.acceptedScenes?.connectors||[]).some(r=>distToPolyline(x,z,r.points)<r.width/2+pad);
}
export function acceptedColliders(data){return acceptedScenes(data).flatMap(s=>s.colliders).filter(c=>!connectorClear(data,c.x,c.z,c.r??Math.hypot(c.hx,c.hz)));}
export {layout as acceptedSceneLayout};
