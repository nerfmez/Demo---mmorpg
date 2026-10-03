// Cosmetic ground regions shared by terrain painting and the map. They do not
// alter height, water, safety zones, encounter spawns or gameplay destinations.
import {pointInPolygon,distToSegment} from './math.js';
import {valueNoise} from './terrain.js';

export function outsideClearingWeight(city,x,z){
  let best=0;
  for(const region of city?.outsideClearings||[]){
    const b=region.bounds,pad=region.edgeBlend+region.edgeWear;
    if(x<b[0]-pad||x>b[1]+pad||z<b[2]-pad||z>b[3]+pad)continue;
    const loops=[region.points,...region.holes||[]];
    const inside=pointInPolygon(region.points,x,z)&&!(region.holes||[]).some(h=>pointInPolygon(h,x,z));
    let edge=Infinity;
    for(const loop of loops)for(let i=0;i<loop.length;i++)edge=Math.min(edge,distToSegment(x,z,...loop[i],...loop[(i+1)%loop.length]).d);
    const wear=(valueNoise(x*.32,z*.32,20261004)-.5)*region.edgeWear;
    const t=Math.max(0,Math.min(1,((inside?edge:-edge)+region.edgeBlend/2+wear)/region.edgeBlend));
    best=Math.max(best,t*t*(3-2*t));
  }
  return best;
}
