// Cosmetic planting only. Terrain, roads, colliders, quest and save data are untouched.
import art from '../../data/art.json' with {type:'json'};
import { createRng } from '../core/rng.js';
import { meadowDensity } from './ground-field.js';
import { surfaceData } from './ground.js';

export function meadowPlants(world, extraPatches=[]) {
  const rng=createRng(842),field=surfaceData(world),hf=world.heightfield,grass=[],flowers=[];
  const sample=(array,x,z,stride=1)=>{
    const gx=Math.max(0,Math.min(hf.w-1.00001,(x-hf.ox)/hf.res)),gz=Math.max(0,Math.min(hf.h-1.00001,(z-hf.oz)/hf.res));
    const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,a=j*hf.w+i;
    return u+v<=1?array[a*stride]*(1-u-v)+array[(a+1)*stride]*u+array[(a+hf.w)*stride]*v:
      array[(a+1)*stride]*(1-v)+array[(a+hf.w)*stride]*(1-u)+array[(a+hf.w+1)*stride]*(u+v-1);
  };
  const clear=(x,z)=>{
    const b=world.bounds;
    if(x<=b.minX+.3||x>=b.maxX-.3||z<=b.minZ+.3||z>=b.maxZ-.3)return false;
    if(world.isWater(x,z,.6)||world.dockAt(x,z)||world.roadDist(x,z)<.1||world.slopeAt(x,z)>.65)return false;
    if(sample(field.coast,x,z,2)>.16||sample(field.road,x,z)>.40||sample(field.stone,x,z)>.16||sample(field.mud,x,z)>.35||sample(field.dirt,x,z)>.66)return false;
    return world.isFree(x,z,.12);
  };
  const patches=[...world.decor.grass,...extraPatches],flowerPatches=[...world.decor.flowers];
  // Fill actual unpaved town lawns/courtyards; no global "safe zone = no grass" shortcut.
  const spacing=art.ground.townPatchSpacing,b=world.bounds;
  for(let z=b.minZ+spacing/2;z<b.maxZ;z+=spacing)for(let x=b.minX+spacing/2;x<b.maxX;x+=spacing){
    if(!world.zoneAt(x,z).safe)continue;
    const px=x+rng.range(-1.7,1.7),pz=z+rng.range(-1.7,1.7);
    if(!clear(px,pz))continue;
    patches.push({x:px,z:pz,s:rng.range(.62,.91)});
    if(rng.next()<.21)flowerPatches.push({x:px+.25,z:pz+.4,s:rng.range(.85,1.15),color:rng.pick([0,0,1,2])});
  }
  for(const patch of patches){
    const density=meadowDensity(patch.x,patch.z),axis=rng.range(0,Math.PI*2);
    for(let k=0;k<art.ground.grassPerPatch;k++){
      if(rng.next()>.22+density*.86)continue;
      // Loose elongated islands; centres carry taller blades, edges taper into ground paint.
      const a=rng.range(0,Math.PI*2),r=k===0?0:Math.sqrt(rng.next())*1.7;
      const lx=Math.sin(a)*r,lz=Math.cos(a)*r*.65;
      const x=patch.x+Math.cos(axis)*lx+Math.sin(axis)*lz,z=patch.z-Math.sin(axis)*lx+Math.cos(axis)*lz;
      if(!clear(x,z)||meadowDensity(x,z)<.16)continue;
      const s=patch.s*rng.range(.62,1.03)*(1-r*.12);
      grass.push({x,z,y:world.groundY(x,z)-.018,ry:axis+rng.range(-1.0,1.0),s});
    }
  }
  for(const patch of flowerPatches){
    if(meadowDensity(patch.x,patch.z)<.29)continue;
    const count=patch.color<=1?7:4,axis=rng.range(0,6.28);
    for(let k=0;k<count;k++){
      const a=axis+k*2.39996,r=k===0?0:Math.sqrt(k/count)*rng.range(.35,.83);
      const x=patch.x+Math.sin(a)*r,z=patch.z+Math.cos(a)*r*.75;
      if(clear(x,z))flowers.push({x,z,y:world.groundY(x,z)-.01,s:patch.s*rng.range(.83,1.2),ry:a,color:art.ground.flowerColors[patch.color]});
    }
  }
  return {grass,flowers};
}
