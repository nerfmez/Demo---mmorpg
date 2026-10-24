import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createWorld} from '../src/core/world.js';
import {loadData} from '../src/core/data-node.js';
import {acceptedSceneLayout,sceneWeight,sceneSample} from '../src/core/accepted-scenes.js';
import {distToPolyline} from '../src/core/math.js';
const path=new URL('../data/world.json',import.meta.url),raw=JSON.parse(execFileSync('git',['show','4468c81251cec9d4ba496e78bed67d048a44b91e:data/world.json'],{encoding:'utf8'})),source={...loadData().world,...raw,city:loadData().world.city};
delete source.acceptedScenes;source.roads=source.roads.filter(r=>!r.acceptedScene);
const native=createWorld(source),scenes=acceptedSceneLayout.scenes;
const round=x=>Math.round(x*1000)/1000;
const inside=(p,s,pad=0)=>p[0]>s.bounds[0]+pad&&p[0]<s.bounds[1]-pad&&p[1]>s.bounds[2]+pad&&p[1]<s.bounds[3]-pad;
const newRoads=[];
for(const s of scenes)for(const road of s.roads){
 let run=[];
 const finish=()=>{if(run.length>1)newRoads.push({...road,id:road.id+(newRoads.some(r=>r.id===road.id)?'/'+newRoads.length:''),acceptedScene:s.id,points:run});run=[];};
 for(const p of road.points){if(inside(p,s,6))run.push(p);else finish();}finish();
}
// Keep the centre guide inside each broad source path while bending round a
// few small shoulder stones; the solids themselves stay in their authored place.
for(const road of newRoads){const s=scenes.find(s=>s.id===road.acceptedScene);
 road.points=road.points.map(p=>{let [x,z]=p;for(const c of s.colliders){if(c.r===undefined||c.r>.6)continue;const d=Math.hypot(x-c.x,z-c.z),min=c.r+.50;if(d<min){x=c.x+(x-c.x)/(d||1)*min;z=c.z+(z-c.z)/(d||1)*min;}}return[round(x),round(z)];});
}
// Native routes outside the replacements remain the backbone. Each approved path
// enters it through a graded apron; no trigger, scene switch or invisible jump.
const endpoints=[];
for(const road of newRoads)for(const index of[0,road.points.length-1]){
 const p=road.points[index];if(endpoints.some(q=>Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<2))continue;
 endpoints.push({p,scene:scenes.find(s=>s.id===road.acceptedScene),road});
}
const outside=[];
for(const r of native.roads)for(let i=0;i<r.points.length-1;i++){
 const a=r.points[i],b=r.points[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
 for(let k=0;k<=n;k++){const t=k/n,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(!scenes.some(s=>inside(p,s,-3))&&!native.isWater(...p,.8)&&native.isFree(...p,.65))outside.push(p);}
}
const connectors=[];
for(const {p,scene,road}of endpoints){
 // Shared junctions are already one continuous ribbon, not separate aprons.
 if(Math.min(p[0]-scene.bounds[0],scene.bounds[1]-p[0],p[1]-scene.bounds[2],scene.bounds[3]-p[1])>9)continue;
 if(newRoads.some(r=>r!==road&&distToPolyline(...p,r.points)<Math.min(road.width,r.width)/2))continue;
 const choices=outside.filter(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>4).sort((a,b)=>Math.hypot(a[0]-p[0],a[1]-p[1])-Math.hypot(b[0]-p[0],b[1]-p[1]));
 if(!choices.length)throw Error('No outside road '+road.id);
 let target=choices.find(q=>!scenes.some(s=>s!==scene&&Array.from({length:11},(_,i)=>[p[0]+(q[0]-p[0])*i/10,p[1]+(q[1]-p[1])*i/10]).some(a=>inside(a,s,-1))));
 target||=choices[0];
 const d=Math.hypot(target[0]-p[0],target[1]-p[1]),steps=Math.max(3,Math.ceil(d/2)),points=[];
 for(let i=0;i<=steps;i++){const t=i/steps;points.push([round(p[0]+(target[0]-p[0])*t),round(p[1]+(target[1]-p[1])*t)]);}
 const start=sceneSample(scene,'heights',...p),end=native.groundY(...target),heights=points.map((_,i)=>round(start+(end-start)*(i/steps)));
 connectors.push({id:'accepted/join-'+connectors.length,width:Math.max(3,Math.min(road.width,4.5)),points,heights,from:road.id});
}
const stair=newRoads.find(r=>r.id==='shell-beach/trail-2');
if(stair){const s=scenes.find(s=>s.id==='shell-beach'),a=sceneSample(s,'heights',...stair.points[0]),b=sceneSample(s,'heights',...stair.points.at(-1));const lengths=[0];for(let i=1;i<stair.points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(stair.points[i][0]-stair.points[i-1][0],stair.points[i][1]-stair.points[i-1][1]));connectors.push({...stair,id:'accepted/shell-upper-apron',heights:lengths.map(d=>round(a+(b-a)*d/lengths.at(-1))),repair:true});}
raw.acceptedScenes={enabled:true,source:acceptedSceneLayout.source,connectors};
function simplify(points){
 if(points.length<3)return points;const a=points[0],b=points.at(-1),dx=b[0]-a[0],dz=b[1]-a[1],ll=dx*dx+dz*dz;let far=.05,index=-1;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(ll||1))),d=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);if(d>far){far=d;index=i;}}
 return index<0?[a,b]:[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))];
}
const retained=[];
for(const road of raw.roads){
 let run=[],part=0;
 const finish=()=>{if(run.length>1){retained.push({...road,id:road.id+(part?'/retained-'+part:''),points:simplify(run)});part++;}run=[];};
 for(let i=0;i<road.points.length-1;i++){
  const a=road.points[i],b=road.points[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.75);
  for(let k=0;k<=n;k++){const t=k/n,p=[round(a[0]+(b[0]-a[0])*t),round(a[1]+(b[1]-a[1])*t)];if(scenes.some(s=>inside(p,s,-3)))finish();else run.push(p);}
 }finish();
}
raw.roads=retained;raw.roads.push(...newRoads,...connectors.map(r=>({...r,acceptedScene:'connector'})));
for(const lm of raw.landmarks)if(['giant_conch','rose_gazebo','hill_windmill','meadow_well','ranger_lookout'].includes(lm.id)){lm.builtin=false;lm.acceptedScene=({giant_conch:'shell-beach',rose_gazebo:'rose-garden',hill_windmill:'hill-windmill',meadow_well:'azure-meadow',ranger_lookout:'forest'})[lm.id];const s=scenes.find(s=>s.id===lm.acceptedScene);if(s.landmark)lm.at=[s.landmark.x,s.landmark.z];}
// Keep the stable IDs, spawn and weapon choices. Only the old decorative wreck
// model is replaced; the game still owns opening stages and weapon markers.
raw.wreck.acceptedScene=true;raw.wreck.weapons={sword:[-130,78],bow:[-127.5,79],staff:[-125,79.5]};
raw.zones.find(z=>z.id==='headland').rects[0][0]=160;
raw.zones.find(z=>z.id==='forest').rects[0][3]=-45;raw.zones.find(z=>z.id==='glade').rects[0][2]=-45;
// Both approved coastal scenes use one continuous game shoreline.
let shore=raw.sea.shore.filter(p=>p[0]<-160||p[0]>-11);
for(const s of scenes.filter(s=>s.shore))shore.push(...s.shore.filter(p=>p[0]>=-160&&p[0]<=-11));
shore.push([-160,raw.sea.shore.find(p=>p[0]===-160)[1]]);shore.sort((a,b)=>a[0]-b[0]);
const blend=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const nativeWestern=raw.sea.coastline.slice(1,raw.sea.coastline.findIndex((p,i)=>i>1&&p[0]>-10));
const linear=(p,x)=>{for(let i=1;i<p.length;i++)if(x<=p[i][0]){const a=p[i-1],b=p[i],t=Math.max(0,(x-a[0])/(b[0]-a[0]||1));return a[1]+(b[1]-a[1])*t;}return p.at(-1)[1];};
const left=scenes.find(s=>s.id==='beach').shore,right=scenes.find(s=>s.id==='shell-beach').shore,jx=(left.at(-1)[0]+right[0][0])/2,jy=(left.at(-1)[1]+right[0][1])/2;
shore=shore.map(([x,z])=>{if(x> -11)return[x,z];const join=1-blend(Math.abs(x-jx)/12);z+=(jy-z)*join;const west=1-blend((x+160)/12),east=blend((x+28)/17);z+=(linear(nativeWestern,x)-z)*Math.max(west,east);return[x,round(z)];});
raw.sea.shore=shore;
// Replace only the western beach section of the concave city contour.
const coast=raw.sea.coastline;const first=coast.findIndex(p=>p[0]>=-160),end=coast.findIndex((p,i)=>i>first&&p[0]>=-11);
const inserted=shore.filter(p=>p[0]>=-160&&p[0]<-11);raw.sea.coastKinds.splice(first,end-first,...inserted.map(()=>'beach'));coast.splice(first,end-first,...inserted);
raw.sea.edgeKinds=shore.slice(0,-1).map(p=>p[0]<-11?'beach':'quay');
raw._doc='Trial integration of accepted standalone scenes; shared sampled terrain, graded roads and arrival waypoint. City V3 and stable progression IDs retained.';
writeFileSync(path,JSON.stringify(raw,null,2)+'\n');console.log({roads:newRoads.length,connectors:connectors.length});
