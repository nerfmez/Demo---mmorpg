// How the world ground inside an accepted scene differs from the scene's own
// surface. After the scenes are applied (core/terrain.js), connector profiles and
// the open map-edge seams edit the heightfield again; render moves the scene's
// meshes by this so they stay on the ground the player walks on.
import {acceptedTarget,connectorPull,sceneSample} from './accepted-scenes.js';
import {seamPull,seamHeight,seamRise} from './terrain.js';
import {polylineZAtX} from './math.js';
import {edgeCliffsAt} from './edge-cliffs.js';

const boxes=new WeakMap();
function connectorBoxes(connectors){
  let list=boxes.get(connectors);if(list)return list;
  list=connectors.map(road=>{
    const pad=road.width/2+2.5,xs=road.points.map(p=>p[0]),zs=road.points.map(p=>p[1]);
    return {road,box:[Math.min(...xs)-pad,Math.max(...xs)+pad,Math.min(...zs)-pad,Math.max(...zs)+pad]};
  });
  boxes.set(connectors,list);return list;
}
// height: the world ground at (x, z) where the scene is fully applied (its
// weight 1); shift: that minus the scene's sampled surface; keep: the share of
// the scene's own relief the edits leave (1 = untouched, 0 = flattened away).
// Mirrors buildHeightfield except the repair smoothing of `repair` connectors.
// `connectors` are the profiles as applied (heightfield.acceptedConnectors).
export function acceptedGroundEdit(data,scene,x,z,connectors=data.acceptedScenes?.connectors||[]){
  let h=acceptedTarget(data,scene,x,z),keep=1;
  for(const {road,box} of connectorBoxes(connectors)){
    if(x<box[0]||x>box[1]||z<box[2]||z>box[3])continue;
    const {w,y}=connectorPull(road,x,z);if(w>0){h+=(y-h)*w;keep*=1-w;}
  }
  for(const seam of data.atlas?.seams||[]){
    if(!seam.profile?.length)continue;
    const m=seamPull(data,seam,x,z);if(!m)continue;
    const along=seam.edge==='minZ'||seam.edge==='maxZ'?x:z;
    h=h*(1-m)+(seamHeight(seam.profile,along)+seamRise(seam,along))*m;keep*=1-m;
  }
  const cliff=edgeCliffsAt(data,x,z);if(cliff>h){h=cliff;keep=0;}
  return {height:h,shift:h-sceneSample(scene,'heights',x,z),keep};
}
// A cheap pre-test for acceptedGroundEdit: false where no connector, seam or
// shore move can reach (x, z), so most of a scene skips the exact sum.
const guards=new WeakMap();
export function acceptedEditReach(data,scene,connectors=data.acceptedScenes?.connectors||[]){
  let byScene=guards.get(connectors);if(!byScene)guards.set(connectors,byScene=new Map());
  let test=byScene.get(scene.id);if(test)return test;
  const near=connectorBoxes(connectors),b=scene.bounds,seams=(data.atlas?.seams||[]).filter(s=>s.profile?.length);
  let shore=null;
  if(scene.shore){
    // Both shorelines sampled every quarter metre over the scene, kept as the z
    // range each spans within a metre (steep inlets); the shore term vanishes 8 m out.
    const x0=b[0]-2,n=Math.ceil((b[1]-x0)/.25)+8,raw=[scene.shore,data.sea.shore].map(line=>Array.from({length:n},(_,i)=>polylineZAtX(line,x0+i*.25)));
    const lo=new Float32Array(n),hi=new Float32Array(n);
    for(let i=0;i<n;i++){lo[i]=Infinity;hi[i]=-Infinity;for(const line of raw)for(let k=Math.max(0,i-4);k<=Math.min(n-1,i+4);k++){lo[i]=Math.min(lo[i],line[k]);hi[i]=Math.max(hi[i],line[k]);}}
    shore={x0,n,lo,hi};
  }
  test=(x,z)=>{
    for(const {box} of near)if(x>=box[0]&&x<=box[1]&&z>=box[2]&&z<=box[3])return true;
    for(const seam of seams)if(seamPull(data,seam,x,z))return true;
    if(edgeCliffsAt(data,x,z)>-Infinity)return true;
    if(shore){const i=Math.max(0,Math.min(shore.n-1,Math.round((x-shore.x0)/.25)));if(z>shore.lo[i]-9.5&&z<shore.hi[i]+9.5)return true;}
    return false;
  };
  byScene.set(scene.id,test);return test;
}

