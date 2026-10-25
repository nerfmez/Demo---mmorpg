// Pure sampled layout exported from the accepted scene factories. Rendering,
// collision, path painting and the Godot export all consume the same coordinates.
import layout from '../../data/accepted-scenes.js';
import {distToPolyline,polylineZAtX} from './math.js';
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
// The scene's own ground past its bounds (scene.outer, exported where a scene's
// uplands, banks and routes run on beyond its frame), or null off that ring. Softened
// (two 7 m box passes): out there its forms carry on as grassy rises, since the scene's
// rock faces end at its bounds and a sheer step would paint as a grey smear.
const softOuter=new WeakMap();
function outerHeights(o){
 let a=softOuter.get(o);if(a)return a;
 const {w,h}=o.grid,r=3;a=Float32Array.from(o.heights);const t=new Float32Array(a.length);
 for(let pass=0;pass<2;pass++){
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let s=0,n=0;for(let k=Math.max(0,i-r);k<=Math.min(w-1,i+r);k++){s+=a[j*w+k];n++;}t[j*w+i]=s/n;}
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let s=0,n=0;for(let k=Math.max(0,j-r);k<=Math.min(h-1,j+r);k++){s+=t[k*w+i];n++;}a[j*w+i]=s/n;}
 }
 softOuter.set(o,a);return a;
}
export function sceneOuter(scene,x,z){
 const o=scene.outer;if(!o)return null;const g=o.grid,fx=(x-g.ox)/g.res,fz=(z-g.oz)/g.res;
 if(fx<0||fz<0||fx>g.w-1.00001||fz>g.h-1.00001)return null;
 const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*g.w+i,a=outerHeights(o);
 return a[k]*(1-u)*(1-v)+a[k+1]*u*(1-v)+a[k+g.w]*(1-u)*v+a[k+g.w+1]*u*v;
}
export function sceneSample(scene,key,x,z){
 const g=scene.grid,fx=Math.max(0,Math.min(g.w-1.00001,(x-g.ox)/g.res)),fz=Math.max(0,Math.min(g.h-1.00001,(z-g.oz)/g.res));
 const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*g.w+i,a=scene[key];
 return a[k]*(1-u)*(1-v)+a[k+1]*u*(1-v)+a[k+g.w]*(1-u)*v+a[k+g.w+1]*u*v;
}
// Metres the whole scene is raised above its authored surface (data: acceptedScenes.lift).
export function sceneLift(data,scene){return data.acceptedScenes?.lift?.[scene.id]??0;}
// The height a scene asks for at a point: its sampled surface plus its lift, with its
// old shoreline moved onto the game's (beach and shell-beach).
export function acceptedTarget(data,scene,x,z){
 let target=sceneSample(scene,'heights',x,z)+sceneLift(data,scene);
 if(scene.shore){const old=polylineZAtX(scene.shore,x),next=polylineZAtX(data.sea.shore,x),cross=d=>d>0?-Math.min(2.7*scene.s,d*.36):Math.min(.18*scene.s,-d*.03);target+=cross(z-next)-cross(z-old);}
 return target;
}
// A connector's pull on the ground at a point: weight w towards its profile height y.
export function connectorPull(road,x,z){
 let best=Infinity,y=0;
 for(let n=0;n<road.points.length-1;n++){
  const a=road.points[n],b=road.points[n+1],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(l||1))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
  if(d<best){best=d;y=road.heights[n]+(road.heights[n+1]-road.heights[n])*t;}
 }
 return {w:1-smooth((best-road.width/2)/2.5),y};
}
// The outer apron (data: acceptedScenes.apron): how far native ground in a ring
// round the listed scene sides moves to meet each scene's edge. For each side the
// rise (scene edge minus native ground at the bound) is smoothed along the side
// and applied in full at the bound and inside the feather, easing to 0 over
// clamp(k*rise, min, max) metres out (per-scene overrides in apron.scene; wobble
// varies the width along the side). Overlapping rings (corners, gaps) average.
// Water and ponds are left alone. Returns one offset per grid node, or null.
export function acceptedApronOffsets(data,grid,heights,waterLevel){
 const cfg=data.acceptedScenes?.apron;if(!cfg||!acceptedScenes(data).length)return null;
 const sum=new Float32Array(grid.w*grid.h),weight=new Float32Array(grid.w*grid.h),most=new Float32Array(grid.w*grid.h);
 const at=(x,z)=>{const fx=Math.max(0,Math.min(grid.w-1.00001,(x-grid.ox)/grid.res)),fz=Math.max(0,Math.min(grid.h-1.00001,(z-grid.oz)/grid.res)),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*grid.w+i;
  return heights[k]*(1-u)*(1-v)+heights[k+1]*u*(1-v)+heights[k+grid.w]*(1-u)*v+heights[k+grid.w+1]*u*v;};
 const box=(a,r)=>a.map((_,i)=>{let s=0,n=0;for(let k=Math.max(0,i-r);k<=Math.min(a.length-1,i+r);k++){s+=a[k];n++;}return s/n;});
 // fades out toward water: over a metre of native height above the water line and
 // over pondMargin metres from a pond's edge, so no bank is left standing over it
 const dry=(k,x,z)=>smooth((heights[k]-waterLevel-cfg.dryMargin))*(data.ponds||[]).reduce((m,[px,pz,pr])=>m*smooth((Math.hypot(x-px,z-pz)-pr-1)/cfg.pondMargin),1);
 for(const scene of acceptedScenes(data)){
  const sides=cfg.sides?.[scene.id]||'';if(!sides)continue;
  const b=scene.bounds,f=scene.feather,own={...cfg,...cfg.scene?.[scene.id]};
  // inland scenes: low dry ground is still ground, only ponds stop the apron
  const fade=own.inland?(k,x,z)=>(data.ponds||[]).reduce((m,[px,pz,pr])=>m*smooth((Math.hypot(x-px,z-pz)-pr-1)/cfg.pondMargin),1):dry;
  for(const side of sides){
   // the side as a segment: along-axis span, the fixed coordinate and the outward direction
   const alongX=side==='N'||side==='S',lo=alongX?b[0]:b[2],hi=alongX?b[1]:b[3],fixed={W:b[0],E:b[1],N:b[2],S:b[3]}[side],out=side==='W'||side==='N'?-1:1;
   const n=Math.max(2,Math.round(hi-lo)+1),rise=[];
   for(let i=0;i<n;i++){
    const t=lo+(hi-lo)*i/(n-1),inset=fixed-out*cfg.inset,[ex,ez]=alongX?[t,inset]:[inset,t],[nx,nz]=alongX?[t,fixed]:[fixed,t];
    rise.push(acceptedTarget(data,scene,ex,ez)-at(nx,nz));
   }
   // wobble: two fixed sines per side (no randomness), so the slope foot meanders
   const wave=t=>own.wobble?1+own.wobble*(.6*Math.sin(t*.21+side.charCodeAt(0))+.4*Math.sin(t*.083+1.7)):1;
   // continue: the edge's own profile runs on outward unsmoothed (a cliff, terrace or
   // bank that meets the side carries on and dies away over one width), instead of a
   // ramp whose width follows the rise
   const r=own.continue?0:Math.round(cfg.smoothAlong/2),d=r?box(box(rise,r),r):rise;
   const width=(own.continue?d.map((_,i)=>own.continue*wave(lo+(hi-lo)*i/(n-1))):box(d.map((v,i)=>Math.max(own.min,Math.min(own.max,own.k*Math.abs(v)))*wave(lo+(hi-lo)*i/(n-1))),r)),reach=Math.max(...width);
   const x0=alongX?lo-reach:(out<0?fixed-reach:fixed-f),x1=alongX?hi+reach:(out<0?fixed+f:fixed+reach),z0=alongX?(out<0?fixed-reach:fixed-f):lo-reach,z1=alongX?(out<0?fixed+f:fixed+reach):hi+reach;
   for(let j=Math.max(0,Math.floor((z0-grid.oz)/grid.res));j<=Math.min(grid.h-1,Math.ceil((z1-grid.oz)/grid.res));j++)
    for(let i=Math.max(0,Math.floor((x0-grid.ox)/grid.res));i<=Math.min(grid.w-1,Math.ceil((x1-grid.ox)/grid.res));i++){
     const x=grid.ox+i*grid.res,z=grid.oz+j*grid.res,k=j*grid.w+i;
     const across=((alongX?z:x)-fixed)*out,along=alongX?x:z;   // across: metres outside the side (negative inside)
     if(across<-f)continue;
     const q=Math.max(lo,Math.min(hi,along)),dist=Math.hypot(Math.max(0,across),along-q),s=Math.round((q-lo)/(hi-lo)*(n-1));
     if(dist>=width[s])continue;
     const a=(1-smooth(dist/width[s]))*fade(k,x,z);if(a<=0)continue;
     // with the scene's own outer ground, its forms continue as authored and fade out
     const outer=own.continue?sceneOuter(scene,x,z):null,rise=outer===null?d[s]:outer+sceneLift(data,scene)-heights[k];
     sum[k]+=a*rise;weight[k]+=a;most[k]=Math.max(most[k],a);
    }
  }
 }
 let any=false;for(let k=0;k<sum.length;k++){if(weight[k]>0){sum[k]=sum[k]/weight[k]*most[k];any=true;}}
 return any?sum:null;
}
// Connector ends that join the world move with the apron under them, and scene ends
// with their scene's lift; the profile between follows linearly.
export function apronConnectors(data,grid,apron){
 const scenes=acceptedScenes(data),weight=(x,z)=>Math.max(0,...scenes.map(s=>sceneWeight(s,x,z)));
 const sample=(x,z)=>{if(!apron)return 0;const fx=Math.max(0,Math.min(grid.w-1.00001,(x-grid.ox)/grid.res)),fz=Math.max(0,Math.min(grid.h-1.00001,(z-grid.oz)/grid.res)),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*grid.w+i;
  return apron[k]*(1-u)*(1-v)+apron[k+1]*u*(1-v)+apron[k+grid.w]*(1-u)*v+apron[k+grid.w+1]*u*v;};
 return (data.acceptedScenes?.connectors||[]).map(road=>{
  const p=road.points,last=p.length-1,outer=weight(...p[0])<weight(...p[last])?0:last,inner=last-outer,lift=sample(...p[outer]);
  const host=scenes.find(s=>sceneWeight(s,...p[inner])>0),rise=host?sceneLift(data,host):0;
  // A raised scene's connector follows the ground's own change at every point: the
  // lift inside the scene, the apron outside, blended across the feather.
  if(rise)return {...road,heights:road.heights.map((h,i)=>{const w=sceneWeight(host,...p[i]);return h+rise*w+sample(...p[i])*(1-w);})};
  if(!lift)return road;
  const len=[0];for(let i=1;i<=last;i++)len.push(len[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));
  return {...road,heights:road.heights.map((h,i)=>h+lift*(outer?len[i]/len[last]:1-len[i]/len[last]))};
 });
}
export function applyAcceptedHeights(data,grid,heights,connectors=data.acceptedScenes?.connectors||[]){
 for(const scene of acceptedScenes(data)){
  const b=scene.bounds;
  for(let j=Math.max(0,Math.floor((b[2]-grid.oz)/grid.res));j<=Math.min(grid.h-1,Math.ceil((b[3]-grid.oz)/grid.res));j++)
   for(let i=Math.max(0,Math.floor((b[0]-grid.ox)/grid.res));i<=Math.min(grid.w-1,Math.ceil((b[1]-grid.ox)/grid.res));i++){
    const x=grid.ox+i*grid.res,z=grid.oz+j*grid.res,w=sceneWeight(scene,x,z),k=j*grid.w+i;
    heights[k]+=(acceptedTarget(data,scene,x,z)-heights[k])*w;
   }
 }
 // Authored connector profiles recover the native road at their far ends.
 for(const road of connectors){
  const xs=road.points.map(p=>p[0]),zs=road.points.map(p=>p[1]),pad=road.width/2+2.5;
  const i0=Math.max(0,Math.floor((Math.min(...xs)-pad-grid.ox)/grid.res)),i1=Math.min(grid.w-1,Math.ceil((Math.max(...xs)+pad-grid.ox)/grid.res));
  const j0=Math.max(0,Math.floor((Math.min(...zs)-pad-grid.oz)/grid.res)),j1=Math.min(grid.h-1,Math.ceil((Math.max(...zs)+pad-grid.oz)/grid.res));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const {w,y}=connectorPull(road,grid.ox+i*grid.res,grid.oz+j*grid.res),k=j*grid.w+i;if(w>0)heights[k]+=(y-heights[k])*w;
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
 return [...(data.acceptedScenes?.connectors||[]),...(data.acceptedScenes?.clearanceRoads||[])].some(r=>distToPolyline(x,z,r.points)<r.width/2+pad);
}
export function acceptedColliders(data){return acceptedScenes(data).flatMap(s=>s.colliders).filter(c=>!connectorClear(data,c.x,c.z,c.r??Math.hypot(c.hx,c.hz)));}
export {layout as acceptedSceneLayout};
