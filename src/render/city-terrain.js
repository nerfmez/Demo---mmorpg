import {cityFloorAt} from '../core/city.js';
import {distToSegment} from '../core/math.js';

// Visibility only: leave a full-cell edge band and retain native peaks. A disk
// wider than the quad encloses it even beside concave source slab boundaries.
export function coveredTerrainCell(city,x,z,maxHeight,res){
  const floor=cityFloorAt(city,x,z);
  if(!floor || maxHeight>=floor.height-.05)return false;
  return floor.points.every((p,i)=>{
    const end=floor.points[(i+1)%floor.points.length];
    return distToSegment(x,z,p[0],p[1],end[0],end[1]).d>res*Math.SQRT2;
  });
}
