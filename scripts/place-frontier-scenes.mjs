// Greenhollow Frontier (data/maps/frontier-wilds.json): put the approved zone scenes into the map.
// Native roads are cropped where a scene stands, the scene's own paths take their place, and each
// path that reaches a scene's edge is joined to the nearest native road outside by a graded
// connector (heights from the scene's ground to the map's). The zone landmark a scene draws is
// marked as the scene's. Re-running replaces what an earlier run added; ids are stable.
// Usage: node scripts/place-frontier-scenes.mjs   (after scripts/inspect-accepted-scenes.mjs)
import {readFileSync,writeFileSync} from 'node:fs';
import {createWorld} from '../src/core/world.js';
import {acceptedSceneLayout,sceneSample} from '../src/core/accepted-scenes.js';
import {distToPolyline} from '../src/core/math.js';
const path=new URL('../data/maps/frontier-wilds.json',import.meta.url),raw=JSON.parse(readFileSync(path,'utf8'));
// the zone landmark each scene draws itself
const LANDMARKS={'sunny-meadow':'meadow_sundial','bramble-glade':'bramble_arch','greyfang-den':'greyfang_den','glimmer-wetland':'glimmer_spire','crag-highlands':'crag_beacon'};
const IDS=Object.keys(LANDMARKS),scenes=acceptedSceneLayout.scenes.filter(s=>IDS.includes(s.id));
const round=x=>Math.round(x*1000)/1000;
// The map file's style: two-space indents, numeric arrays (and lists of number pairs) on one line,
// non-ASCII text escaped as \uXXXX.
const num=a=>Array.isArray(a)&&a.every(x=>typeof x==='number');
function format(v,ind=''){
 if(num(v))return '['+v.join(', ')+']';
 if(Array.isArray(v)&&v.length&&v.every(num))return '['+v.map(a=>'['+a.join(', ')+']').join(', ')+']';
 const str=x=>JSON.stringify(x).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(Array.isArray(v))return v.length?'[\n'+v.map(x=>ind+'  '+format(x,ind+'  ')).join(',\n')+'\n'+ind+']':'[]';
 if(v&&typeof v==='object'){const k=Object.keys(v);return k.length?'{\n'+k.map(key=>ind+'  '+str(key)+': '+format(v[key],ind+'  ')).join(',\n')+'\n'+ind+'}':'{}';}
 return str(v);
}
const inside=(p,s,pad=0)=>p[0]>s.bounds[0]+pad&&p[0]<s.bounds[1]-pad&&p[1]>s.bounds[2]+pad&&p[1]<s.bounds[3]-pad;
// an earlier run's additions go first
raw.roads=raw.roads.filter(r=>!IDS.includes(r.acceptedScene)&&!IDS.includes(r.joins));
raw.acceptedScenes.connectors=raw.acceptedScenes.connectors.filter(c=>!IDS.includes(c.joins));
function simplify(points){
 if(points.length<3)return points;const a=points[0],b=points.at(-1),dx=b[0]-a[0],dz=b[1]-a[1],ll=dx*dx+dz*dz;let far=.05,index=-1;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(ll||1))),d=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);if(d>far){far=d;index=i;}}
 return index<0?[a,b]:[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))];
}
// native roads: kept outside the scenes, cut into pieces where they cross one
const retained=[];
for(const road of raw.roads){
 if(road.acceptedScene||!road.points.some(p=>scenes.some(s=>inside(p,s,-12)))){retained.push(road);continue;}
 let run=[],part=0;
 const finish=()=>{if(run.length>1){retained.push({...road,id:road.id+(part?'/retained-'+part:''),points:simplify(run)});part++;}run=[];};
 for(let i=0;i<road.points.length-1;i++){
  const a=road.points[i],b=road.points[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.75);
  for(let k=(i?1:0);k<=n;k++){const t=k/n,p=[round(a[0]+(b[0]-a[0])*t),round(a[1]+(b[1]-a[1])*t)];if(scenes.some(s=>inside(p,s,-3)))finish();else run.push(p);}
 }finish();
}
raw.roads=retained;
// the scenes' own paths, inside their frames
const newRoads=[];
for(const s of scenes)for(const road of s.roads){
 let run=[];
 const finish=()=>{if(run.length>1)newRoads.push({...road,id:road.id+(newRoads.some(r=>r.id===road.id)?'/'+newRoads.length:''),acceptedScene:s.id,points:run});run=[];};
 for(const p of road.points){if(inside(p,s,6))run.push(p);else finish();}finish();
}
// The den's cave path runs to the tunnel's closed back; the walk ends before it (the back wall is solid).
for(const r of newRoads)if(r.id==='greyfang-den/cave'){const c=scenes.find(s=>s.id==='greyfang-den').cave;r.points=r.points.filter(p=>Math.hypot(p[0]-c.bx,p[1]-c.bz)>4.5);}
const world=createWorld(raw);
// Each native road a scene cut is joined, from its cut end, to the nearest point of that scene's own
// paths: the map's roads run on into the scene. The scenes' other paths lead off into the woods.
const connectors=[];
const boxDist=(p,s)=>Math.hypot(Math.max(s.bounds[0]-p[0],0,p[0]-s.bounds[1]),Math.max(s.bounds[2]-p[1],0,p[1]-s.bounds[3]));
for(const road of retained){if(road.acceptedScene)continue;for(const end of[road.points[0],road.points.at(-1)]){
 const scene=scenes.find(s=>boxDist(end,s)<5);if(!scene)continue;
 let best=null;for(const r of newRoads.filter(r=>r.acceptedScene===scene.id))for(const q of r.points){const d=Math.hypot(q[0]-end[0],q[1]-end[1]);if(!best||d<best.d)best={d,q,r};}
 if(!best)continue;
 const p=best.q,target=end,d=best.d,steps=Math.max(3,Math.ceil(d/2)),points=[];
 for(let i=0;i<=steps;i++){const t=i/steps;points.push([round(p[0]+(target[0]-p[0])*t),round(p[1]+(target[1]-p[1])*t)]);}
 const start=sceneSample(scene,'heights',...p),stop=world.groundY(...target),heights=points.map((_,i)=>round(start+(stop-start)*(i/steps)));
 connectors.push({id:'accepted/'+road.id.replace(/\//g,'-')+'-'+scene.id,final:true,width:Math.max(3,Math.min(road.width,best.r.width,4)),points,heights,from:road.id,joins:scene.id});
}}
raw.roads.push(...newRoads,...connectors.map(r=>({...r,acceptedScene:'connector'})));
raw.acceptedScenes.connectors.push(...connectors);
for(const lm of raw.landmarks){const id=Object.keys(LANDMARKS).find(k=>LANDMARKS[k]===lm.id);if(id)lm.acceptedScene=id;}
// Greyfang Den draws the den itself (the cave, the bones): the native den ring goes, and the pack
// leader waits in the clearing before the cave mouth.
const den=scenes.find(s=>s.id==='greyfang-den');
if(den){delete raw.den;const boss=raw.bosses.find(b=>b.id==='greyfang'),at=[round(den.cave.ax),round(den.cave.az+9)];boss.pos=at;boss.arena={x:at[0],z:at[1],r:8};}
// The wetland's waypoint stood where its pools now are: it moves onto the open ground at the fork.
const wet=scenes.find(s=>s.id==='glimmer-wetland');
if(wet){const fork=wet.roads.find(r=>r.id==='glimmer-wetland/south').points.at(-1),wp=raw.waypoints.find(w=>w.id==='wetland');wp.pos=[round(fork[0]+3.5),round(fork[1]+2.5)];
 // the pools: circles filling each waterline are their collision (the scene's waterline is what is drawn)
 raw.ponds=raw.ponds.filter(p=>!inside(p,wet));
 for(const pool of wet.pools){
  const n=pool.radius.length,rim=a=>{const f=(a+Math.PI)/(2*Math.PI)*n,i=Math.floor(f),u=f-i;return pool.radius[((i%n)+n)%n]*(1-u)+pool.radius[(i+1)%n]*u;};
  const edge=Array.from({length:288},(_,i)=>{const a=-Math.PI+i/288*Math.PI*2,r=rim(a);return[pool.x+Math.cos(a)*r,pool.z+Math.sin(a)*r];});
  // metres to the nearest point of the waterline, inside the pool (negative outside)
  const inPool=(x,z)=>{const d=Math.min(...edge.map(([ex,ez])=>Math.hypot(x-ex,z-ez)));return rim(Math.atan2(z-pool.z,x-pool.x))>Math.hypot(x-pool.x,z-pool.z)?d:-d;};
  const cells=[];for(let x=pool.x-13;x<=pool.x+13;x+=.5)for(let z=pool.z-13;z<=pool.z+13;z+=.5)if(inPool(x,z)>.6)cells.push([x,z]);
  const covered=new Set(),circles=[];
  while(covered.size<cells.length*.95&&circles.length<16){
   let best=null;
   for(const [x,z]of cells){const r=inPool(x,z)-.35;if(r<.8)continue;let gain=0;for(let k=0;k<cells.length;k++)if(!covered.has(k)&&Math.hypot(cells[k][0]-x,cells[k][1]-z)<r)gain++;if(!best||gain>best.gain)best={x,z,r,gain};}
   if(!best||!best.gain)break;circles.push([round(best.x),round(best.z),round(best.r),0]);
   cells.forEach(([x,z],k)=>{if(Math.hypot(x-best.x,z-best.z)<best.r)covered.add(k);});
  }
  raw.ponds.push(...circles);
 }
}
// Flowers spread round each scene into the map (core/world.js plantSceneSurrounds, owner 31 October 2026).
const plant=raw.acceptedScenes.surround.plant;
plant.flowers={perScene:170,inner:0,outer:26,clump:[3,6],clumpRadius:1.6,spacing:.45,size:[.7,1.2],slope:1.2};
plant._doc=plant._doc.replace(/ Flowers:.*$/,'')+' Flowers: clumps of the zone\'s own flowers in a wider ring round each scene, thinning outward (owner, 31 October 2026: flowers all round a scene, not only in one spot).';
for(const id of IDS)if(!raw.acceptedScenes.grassBanks.includes(id))raw.acceptedScenes.grassBanks.push(id);
writeFileSync(path,format(raw)+'\n');
console.log({scenes:scenes.map(s=>s.id),roads:newRoads.length,connectors:connectors.map(c=>c.id)});
