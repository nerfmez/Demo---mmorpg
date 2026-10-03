// Source-derived walk surfaces. No render imports; usable by the Godot exporter.
import { pointInPolygon } from './math.js';

// Exact source street polygons; a paved plaza is walkable but is not a narrow road.
export function cityRoadDistance(city,x,z){
  let best=Infinity;
  for(const road of city.roads){
    if(road.name.startsWith('Market '))continue;
    const b=road.bounds;
    if(x<b[0]-8||x>b[1]+8||z<b[2]-8||z>b[3]+8)continue;
    let edge=Infinity,inside=false;
    for(const loop of road.loops){
    if(pointInPolygon(loop,x,z))inside=!inside;
    for(let i=0;i<loop.length;i++){
      const a=loop[i],b=loop[(i+1)%loop.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
      edge=Math.min(edge,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
    }
    }
    best=Math.min(best,inside?-edge:edge);
  }
  return best;
}

export function cityFloorAt(city, x, z, radius = 0) {
  if (!city?.enabled) return null;
  let found=null;
  for (const floor of city.floors) {
    if (floor.bounds && (x < floor.bounds[0] || x > floor.bounds[1] || z < floor.bounds[2] || z > floor.bounds[3])) continue;
    if (!pointInPolygon(floor.points, x, z)) continue;
    if (floor.holes?.some(hole=>pointInPolygon(hole,x,z))) continue;
    if (radius > 0) {
      let supported = true;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const px=x+Math.sin(a)*radius,pz=z+Math.cos(a)*radius;
        if (!pointInPolygon(floor.points, px, pz)||floor.holes?.some(hole=>pointInPolygon(hole,px,pz))) { supported = false; break; }
      }
      if (!supported) continue;
    }
    if(!found || floor.height>found.height)found=floor;
  }
  return found;
}
