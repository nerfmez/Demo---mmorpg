// Read-only design export. This file is never imported by the game.
import {writeFileSync,readFileSync} from 'node:fs';
import {loadData} from '../../../src/core/data-node.js';
import {createWorld} from '../../../src/core/world.js';
import {cityFloorAt} from '../../../src/core/city.js';
const plan=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
const data=loadData(),res=2,regions=[];
for(const d of Object.values(data.maps)){
 const world=createWorld(d),b=d.bounds,p=plan.placementPolicy;
 const w=Math.ceil((b.maxX-b.minX)/res),h=Math.ceil((b.maxZ-b.minZ)/res);
 const heights=[],water=[],palette=[],protectedCells=[];
 const anchors=[{at:d.playerSpawn,r:p.spawnClearanceMetres},...d.waypoints.map(a=>({at:a.pos,r:p.waypointClearanceMetres})),
  ...d.landmarks.map(a=>({at:a.at,r:(a.clear||6)+p.landmarkExtraClearanceMetres})),
  ...d.bosses.map(a=>({at:[a.arena.x,a.arena.z],r:a.arena.r+4})),
  ...plan.openCourts.filter(c=>c.region===d.id).map(c=>({at:c.at,r:c.diameter/2}))];
 const seamProtected=(x,z)=>d.atlas.seams.some(s=>{
  const along=s.edge.endsWith('X')?z:x,across=s.edge.endsWith('X')?x:z;
  return along>=s.span[0]-p.seamBandMetres&&along<=s.span[1]+p.seamBandMetres&&Math.abs(across-b[s.edge])<p.seamBandMetres;
 });
 const nearCity=(x,z)=>{
  if(!d.city?.enabled)return false;
  if(cityFloorAt(d.city,x,z))return true;
  for(let k=0;k<12;k++){const a=k*Math.PI/6;if(cityFloorAt(d.city,x+Math.cos(a)*p.cityFloorClearanceMetres,z+Math.sin(a)*p.cityFloorClearanceMetres))return true;}
  return false;
 };
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const x=b.minX+(i+.5)*res,z=b.minZ+(j+.5)*res;
  heights.push(Math.round(world.terrainY(x,z)*100)/100);water.push(world.isWater(x,z)?1:0);
  palette.push(world.zoneAt(x,z).palette[0]);
  protectedCells.push(+(world.roadDist(x,z)<p.roadExtraClearanceMetres||world.isWater(x,z,p.waterExtraClearanceMetres)||world.isSafe(x,z)||
   anchors.some(a=>Math.hypot(x-a.at[0],z-a.at[1])<a.r)||seamProtected(x,z)||nearCity(x,z)));
 }
 regions.push({id:d.id,name:d.name,bounds:b,offset:d.atlas.offset,res,w,h,heights,water,palette,protectedCells,
  roads:d.roads,landmarks:d.landmarks,waypoints:d.waypoints,town:d.town,city:d.city?.enabled?{floors:d.city.floors,roads:d.city.roads}:null,seams:d.atlas.seams.map(({profile,...s})=>s)});
}
const path=process.argv[2];if(!path)throw Error('Pass an output JSON path outside the repository.');
writeFileSync(path,JSON.stringify({source:plan.sourceMain,res,regions}));
console.log(JSON.stringify({output:path,regions:regions.length,cells:regions.reduce((n,r)=>n+r.w*r.h,0)}));
