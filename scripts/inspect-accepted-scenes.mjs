// Node-only source export. No renderer is substituted in the delivered game.
import {createCanvas} from '@napi-rs/canvas';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {distToPolyline} from '../src/core/math.js';
// The factories use the game's foliage modules, which import data JSON as the bundler does.
registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
globalThis.document={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
const renderer={domElement:{height:900},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
const specs=[
 {id:'beach',x:-128.68,z:77.12,s:.8,y:-.44,box:[-38,38,-40,25]},
 {id:'forest',x:-112,z:-64,s:.62,y:.4,box:[-58,58,-70,20]},
 {id:'rose-garden',x:-100,z:20,s:.68,y:.4,box:[-60,60,-60,28]},
 // west of the arrival beach on the Greenhollow Frontier coast (Frontier local metres; world = local + atlas offset)
 {id:'shell-beach',region:'frontier-wilds-v1',x:152,z:176,s:.60,y:-.44,box:[-70,70,-65,50]},
 {id:'azure-meadow',x:38,z:-85,s:.50,y:.4,box:[-65,65,-65,30]},
 {id:'hill-windmill',x:126,z:-85,s:.48,y:.4,box:[-65,65,-65,30],outer:30},
 // the two coastal zones on the east coast (owner, 26 October 2026: headland at the north-east corner, the
 // ranger forest below it); y puts each scene's sea (SEA_Y = -7.18 scene units) at the map's water level
 {id:'gull-headland',x:189.3,z:-92.7,s:.42,y:2.62,box:[-65,65,-65,30]},
 {id:'ranger-forest',x:189.3,z:-34.7,s:.42,y:2.62,box:[-65,65,-65,30]},
 // the five Moonroot Grove zones (owner, 26-27 October 2026), placed in Moonroot's local metres as
 // the region concept (assets/moonroot/moonroot_grove_concept.jpg, 370 x 117 m) lays them out, not in
 // a row: Moonstone Camp up on the west (its warp pillar is the region's camp waypoint), Root Warren
 // below it by the Frontier gate (its moles, Lv 9-10, border the Frontier forest), Mirror Pond in the
 // middle (y puts its water, SEA_Y = -1.404 scene units, at the water level), Fern Rise in the north
 // woods, the Old Root Stone Ring on the east
 {id:'root-warren',region:'moonroot-grove-v1',x:-150,z:36,s:.42,y:.3,box:[-65,65,-65,30]},
 {id:'moonstone-camp',region:'moonroot-grove-v1',x:-108,z:-8,s:.42,y:.3,box:[-65,65,-65,30],waypoint:'camp'},
 {id:'mirror-pond',region:'moonroot-grove-v1',x:7,z:8,s:.42,y:.19,box:[-65,65,-65,30]},
 {id:'fern-rise',region:'moonroot-grove-v1',x:66,z:-26,s:.42,y:.3,box:[-65,65,-65,30]},
 {id:'stone-ring',region:'moonroot-grove-v1',x:138,z:2,s:.42,y:.3,box:[-65,65,-65,30]},
 // Greenhollow Frontier's seven zones (owner, 31 October 2026), each in its zone of the Frontier map
 // (local metres), standing where the zone's landmark stood: the meadow's sundial on the main road, the
 // glade's bramble arch, the wolf den in the north woods (its cave where the den was), the wetland's
 // crystal between its pools (on the main road; y puts its pools' water, SEA_Y = -1.092 scene units, at
 // the water level), the highlands' brazier shrine
 {id:'sunny-meadow',region:'frontier-wilds-v1',clearPaths:true,x:89,z:6,s:.42,y:.3,box:[-65,65,-65,30]},
 {id:'bramble-glade',region:'frontier-wilds-v1',clearPaths:true,x:100,z:100,s:.42,y:.3,box:[-65,65,-65,30]},
 {id:'greyfang-den',region:'frontier-wilds-v1',clearPaths:true,x:100,z:-114,s:.42,y:.3,box:[-65,65,-65,30]},
 {id:'glimmer-wetland',region:'frontier-wilds-v1',clearPaths:true,x:-62,z:26,s:.42,y:.06,box:[-65,65,-65,30]},
 {id:'crag-highlands',region:'frontier-wilds-v1',clearPaths:true,x:-140,z:-80,s:.42,y:.3,box:[-65,65,-65,30]},
 // the Frontier Settlement: the village just south of the main road from Azure Coast, which passes
 // along its north side and turns in by its north and north-east paths; the town's services stand in
 // its square
 {id:'frontier-settlement',region:'frontier-wilds-v1',clearPaths:true,x:196.5,z:33.5,s:.42,y:.4,box:[-65,65,-65,30]},
 // Sunfall Coast on the south coast, its sea in a bay cut into the land (sea.bays, the arch over it); y puts
 // its sea, SEA_Y = -2.184 scene units, at the water level
 {id:'sunfall-coast',region:'frontier-wilds-v1',clearPaths:true,x:6,z:165.4,s:.42,y:.517,box:[-65,65,-65,30]}
];
const round=n=>Math.round(n*1000)/1000,scenes=[];
// Optional ids on the command line export only those scenes (the others' files stay as committed).
const only=process.argv.slice(2);
// Morphological closing (a max then a min filter over a square r metres each way, 1 m grid).
function close(a,w,h,r){
 const pass=(src,pick)=>{const t=new Float64Array(src.length),out=new Float64Array(src.length);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let m=src[j*w+i];for(let k=Math.max(0,i-r);k<=Math.min(w-1,i+r);k++)m=pick(m,src[j*w+k]);t[j*w+i]=m;}
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let m=t[j*w+i];for(let k=Math.max(0,j-r);k<=Math.min(h-1,j+r);k++)m=pick(m,t[k*w+i]);out[j*w+i]=m;}
  return out;};
 const c=pass(pass(a,Math.max),Math.min);for(let k=0;k<a.length;k++)a[k]=round(c[k]);
}
for(const spec of specs){
 if(only.length&&!only.includes(spec.id))continue;
 const {createAcceptedScene}=await import('../src/render/accepted-scenes/'+spec.id+'.js');
 const a=createAcceptedScene({renderer,clipBounds:spec.box});
 const [x0,x1,z0,z1]=spec.box,bounds=[spec.x+x0*spec.s,spec.x+x1*spec.s,spec.z+z0*spec.s,spec.z+z1*spec.s].map(round);
 const res=.5,w=Math.ceil((bounds[1]-bounds[0])/res)+1,h=Math.ceil((bounds[3]-bounds[2])/res)+1,heights=[],trails=[];
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const x=(bounds[0]+i*res-spec.x)/spec.s,z=(bounds[2]+j*res-spec.z)/spec.s;
  heights.push(round(a.height(x,z)*spec.s+spec.y));trails.push(round(Math.max(-8,Math.min(8,a.trailDistance(x,z)*spec.s))));
 }
 const inside=c=>c.x>bounds[0]+2&&c.x<bounds[1]-2&&c.z>bounds[2]+2&&c.z<bounds[3]-2;
 const colliders=[];
 for(const c of a.colliders){
  const p={x:round(spec.x+c.x*spec.s),z:round(spec.z+c.z*spec.s),type:'accepted-scene',sceneId:spec.id};
  if(!inside(p))continue;
  if(c.seg){const dx=(c.x1-c.x)*spec.s,dz=(c.z1-c.z)*spec.s;colliders.push({...p,x:round(p.x+dx/2),z:round(p.z+dz/2),hx:round(c.r*spec.s),hz:round(Math.hypot(dx,dz)/2),angle:Math.atan2(dx,dz)});}
  else if(c.box)colliders.push({...p,hx:round(c.w*spec.s/2),hz:round(c.d*spec.s/2),angle:c.ry});
  else if(c.ellipse){for(let i=0;i<12;i++){const angle=i/12*Math.PI*2;colliders.push({...p,x:p.x+Math.cos(angle)*c.rx*spec.s*.6,z:p.z+Math.sin(angle)*c.rz*spec.s*.6,r:Math.min(c.rx,c.rz)*spec.s*.5});}}
  else colliders.push({...p,r:round(c.r*spec.s)});
 }
 const roads=[];
 const transform=rows=>rows.map(p=>[round(spec.x+p.x*spec.s),round(spec.z+p.z*spec.s)]);
 for(const r of a.routes)roads.push({id:spec.id+'/'+r.id,width:round(r.rows.reduce((v,p)=>v+p.w,0)/r.rows.length*spec.s),points:transform(r.rows)});
 for(const [i,t]of a.trails.entries())roads.push({id:spec.id+'/trail-'+i,width:round(t.reduce((v,p)=>v+(p.w??p.y),0)/t.length*2*spec.s),points:transform(t)});
 if(spec.id==='beach')roads.push({id:'beach/track',width:4.5,points:[[2.6,-38],[2.6,-27],[2.6,-15],[3,-7],[0,4]].map(([x,z])=>[round(spec.x+x*spec.s),round(spec.z+z*spec.s)])});
 // clearPaths: a solid circle beside a path (a tree, a rock) keeps off it by the game's hero radius
 // (0.45 m; the standalone pages walked with 0.3), so every path of the scene stays walkable
 if(spec.clearPaths)for(const c of colliders){if(c.r===undefined)continue;const d=Math.min(...roads.map(r=>distToPolyline(c.x,c.z,r.points)));if(d>.8&&d-.5<c.r)c.r=round(Math.max(.25,d-.5));}
 const scene={landmark:a.landmark?{x:round(spec.x+a.landmark.x*spec.s),z:round(spec.z+a.landmark.z*spec.s)}:null,...spec,bounds,feather:5,grid:{ox:bounds[0],oz:bounds[2],res,w,h},heights,trails,colliders,roads};
 // outer: the scene's own ground past its bounds (its banks, uplands and routes run on
 // beyond the frame), so the world can continue the scene's forms instead of cutting them
 if(spec.outer){const m=spec.outer,o=[bounds[0]-m,bounds[1]+m,bounds[2]-m,bounds[3]+m],r=1,ow=Math.ceil((o[1]-o[0])/r)+1,oh=Math.ceil((o[3]-o[2])/r)+1,oy=[];
  for(let j=0;j<oh;j++)for(let i=0;i<ow;i++)oy.push(round(a.height((o[0]+i*r-spec.x)/spec.s,(o[2]+j*r-spec.z)/spec.s)*spec.s+spec.y));
  // outerFill: gullies and slots narrower than about twice this many metres (a stair
 // ravine, the cove behind a wall) close over instead of running on as ravines
 if(spec.outerFill)close(oy,ow,oh,spec.outerFill);
 scene.outer={grid:{ox:o[0],oz:o[2],res:r,w:ow,h:oh},heights:oy};}
 // the warp pillar's place, for the waypoint it stands for (render wires the pillar to it)
 if(a.waypoint&&spec.waypoint)scene.waypoint={id:spec.waypoint,x:round(spec.x+a.waypoint.x*spec.s),z:round(spec.z+a.waypoint.z*spec.s)};
 // Mirror Pond: its waterline (world metres round the pond's centre) and the stepping stones' crossing
 if(a.pond){const P0=a.pond;scene.pond={x:round(spec.x+P0.cx*spec.s),z:round(spec.z+P0.cz*spec.s),y:round(P0.waterY*spec.s+spec.y),radius:Array.from({length:72},(_,i)=>round(P0.radius(-Math.PI+i/72*Math.PI*2)*spec.s))};}
 // Glimmer Wetland: each pool's waterline, as Mirror Pond's
 if(a.pools){const W=a.pools;scene.pools=W.list.map(P0=>({x:round(spec.x+P0.cx*spec.s),z:round(spec.z+P0.cz*spec.s),y:round(W.waterY*spec.s+spec.y),radius:Array.from({length:72},(_,i)=>round(W.radius(P0,-Math.PI+i/72*Math.PI*2)*spec.s))}));}
 // Greyfang Den: the cave tunnel (its mouth, its back and width), so the game can open its roof over the hero
 if(a.cave){const C=a.cave;scene.cave={ax:round(spec.x+C.ax*spec.s),az:round(spec.z+C.az*spec.s),bx:round(spec.x+C.bx*spec.s),bz:round(spec.z+C.bz*spec.s),w:round(C.w*spec.s),h:round(C.h*spec.s)};}
 if(a.crossing)scene.crossing={line:a.crossing.line.map(([x,z])=>[round(spec.x+x*spec.s),round(spec.z+z*spec.s)]),stones:a.crossing.stones.map(st=>({x:round(spec.x+st.x*spec.s),z:round(spec.z+st.z*spec.s),r:round(st.r*spec.s),top:round(st.top*spec.s+spec.y)}))};
 if(a.shore)scene.shore=Array.from({length:Math.ceil((bounds[1]-bounds[0])/2)+1},(_,i)=>{const x=bounds[0]+i*2;return[round(x),round(spec.z+a.shore((x-spec.x)/spec.s)*spec.s)];});
 scenes.push(scene);console.log(spec.id,{colliders:colliders.length,roads:roads.length,bounds,meshes:a.root.children.length});
}
mkdirSync(new URL('../data/accepted-scenes/',import.meta.url),{recursive:true});
for(const scene of scenes)writeFileSync(new URL('../data/accepted-scenes/'+scene.id+'.json',import.meta.url),JSON.stringify(scene)+'\n');
writeFileSync(new URL('../data/accepted-scenes.json',import.meta.url),JSON.stringify({version:1,source:'00bed638a57b6217f675e1a279fcc8fcf769dda7',scenes:only.length?[...JSON.parse(readFileSync(new URL('../data/accepted-scenes.json',import.meta.url),'utf8')).scenes.filter(id=>!only.includes(id)),...scenes.map(s=>s.id)]:scenes.map(s=>s.id)})+'\n');
