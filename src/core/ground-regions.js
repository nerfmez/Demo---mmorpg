// Cosmetic ground regions shared by terrain painting and the map. They do not
// alter height, water, safety zones, encounter spawns or gameplay destinations.
import {pointInPolygon,distToPolyline,distToPolylineBounds} from './math.js';
import {valueNoise} from './terrain.js';
import {acceptedScenes,sceneWeight} from './accepted-scenes.js';

const holeBounds=new WeakMap();
function loopDistance(points,x,z){
  let best=Infinity;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
    const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
    const px=x-a[0]-t*dx,pz=z-a[1]-t*dz;best=Math.min(best,px*px+pz*pz);
  }
  return Math.sqrt(best);
}
const blend=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function outsideClearingWeight(city,x,z){
  let best=0;
  for(const region of city?.outsideClearings||[]){
    const b=region.bounds,pad=region.edgeBlend+region.edgeWear;
    if(x<b[0]-pad||x>b[1]+pad||z<b[2]-pad||z>b[3]+pad)continue;
    const wear=(valueNoise(x*.32,z*.32,20261004)-.5)*region.edgeWear;
    const edge=loopDistance(region.points,x,z);
    let weight=blend(((pointInPolygon(region.points,x,z)?edge:-edge)+region.edgeBlend/2+wear)/region.edgeBlend);
    // Intersect outer fill with every retained island independently. A hole
    // crossing the outer boundary must not leak dirt through the tree's centre.
    for(const hole of region.holes||[]){
      let hb=holeBounds.get(hole);
      if(!hb){hb=[Infinity,-Infinity,Infinity,-Infinity];for(const p of hole){hb[0]=Math.min(hb[0],p[0]);hb[1]=Math.max(hb[1],p[0]);hb[2]=Math.min(hb[2],p[1]);hb[3]=Math.max(hb[3],p[1]);}holeBounds.set(hole,hb);}
      if(x<hb[0]-pad||x>hb[1]+pad||z<hb[2]-pad||z>hb[3]+pad)continue;
      const distance=loopDistance(hole,x,z);
      weight=Math.min(weight,blend(((pointInPolygon(hole,x,z)?-distance:distance)+region.edgeBlend/2+wear)/region.edgeBlend));
      if(weight===0)break;
    }
    best=Math.max(best,weight);
  }
  return best;
}
// Presentation-only replacement. Simulation roads continue to grade the native
// heightfield and preserve seeded vegetation, safety, collision and spawns.
export function outsideRoadVisible(city,id){
  return !(city?.outsideRoadReview?.replacedRoadIds||[]).includes(id);
}
export function outsideRoadDistance(city,roads,x,z){
  let distance=Infinity;
  for(const road of roads)if(outsideRoadVisible(city,road.id)&&distToPolylineBounds(x,z,road.points)-road.width/2<distance)
    distance=Math.min(distance,distToPolyline(x,z,road.points)-road.width/2);
  return distance;
}

// The ring outside the accepted scenes (data: acceptedScenes.surround), where
// native paint eases into the scenes' look. 1 at a scene's bounds and inside it,
// 0 `ring` metres out; the outer edge wobbles so it never reads as a band.
export function sceneSurround(data,x,z,ring){
  const cfg=data.acceptedScenes?.surround;if(!cfg||!ring)return 0;
  let d=Infinity;
  for(const s of acceptedScenes(data)){const b=s.bounds;d=Math.min(d,Math.hypot(Math.max(b[0]-x,0,x-b[1]),Math.max(b[2]-z,0,z-b[3])));}
  if(d>ring+cfg.wobble)return 0;
  const wobble=(valueNoise(x*.11,z*.11,20261025)-.5)*2*cfg.wobble*blend(d/4);
  return 1-blend(Math.max(0,d+wobble)/ring);
}
// Routes that keep their earth inside the ring: every visible road (connectors
// included), each connector carried on past its outer end, and the clearings
// round the waypoints. 1 on a route, 0 a keepWidth beyond it.
const extensions=new WeakMap();
function connectorExtensions(data){
  let list=extensions.get(data);if(list)return list;
  list=[];const scenes=acceptedScenes(data),cfg=data.acceptedScenes?.surround;
  const weight=(x,z)=>Math.max(0,...scenes.map(s=>sceneWeight(s,x,z)));
  for(const road of data.acceptedScenes?.connectors||[]){
    const p=road.points,n=p.length;if(n<2)continue;
    // the end lying further out of the scenes is the one that joins the native world
    const [a,b]=weight(...p[0])<weight(...p[n-1])?[p[1],p[0]]:[p[n-2],p[n-1]];
    const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
    list.push({points:[b,[b[0]+dx/l*cfg.connectorExtension,b[1]+dz/l*cfg.connectorExtension]],width:road.width});
  }
  extensions.set(data,list);return list;
}
const keptRoads=new WeakMap();
export function sceneKeep(data,roads,x,z){
  const cfg=data.acceptedScenes?.surround;if(!cfg)return 0;
  let keep=0,list=keptRoads.get(roads);
  if(!list)keptRoads.set(roads,list=[...roads.filter(r=>outsideRoadVisible(data.city,r.id)),...connectorExtensions(data)]);
  for(const road of list){
    if(distToPolylineBounds(x,z,road.points)-road.width/2>cfg.keepWidth)continue;
    keep=Math.max(keep,1-blend((distToPolyline(x,z,road.points)-road.width/2)/cfg.keepWidth));
    if(keep===1)return 1;
  }
  for(const w of data.waypoints||[])keep=Math.max(keep,1-blend((Math.hypot(x-w.pos[0],z-w.pos[1])-cfg.waypointKeep[0])/(cfg.waypointKeep[1]-cfg.waypointKeep[0])));
  return keep;
}
// How much of the town's earth clearing an accepted scene and its ring take back.
export function sceneClearingFade(data,roads,x,z){
  const scene=acceptedScenes(data).reduce((m,s)=>Math.max(m,sceneWeight(s,x,z)),0);
  const ring=sceneSurround(data,x,z,data.acceptedScenes?.surround?.clearRing);
  return Math.max(scene,ring&&ring*(1-sceneKeep(data,roads,x,z)));
}
