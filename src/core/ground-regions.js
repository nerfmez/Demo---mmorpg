// Cosmetic ground regions shared by terrain painting and the map. They do not
// alter height, water, safety zones, encounter spawns or gameplay destinations.
import {pointInPolygon,distToPolyline} from './math.js';
import {valueNoise} from './terrain.js';

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
  for(const road of roads)if(outsideRoadVisible(city,road.id))
    distance=Math.min(distance,distToPolyline(x,z,road.points)-road.width/2);
  return distance;
}
