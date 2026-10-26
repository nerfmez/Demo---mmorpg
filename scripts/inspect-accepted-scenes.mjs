// Node-only source export. No renderer is substituted in the delivered game.
import {createCanvas} from '@napi-rs/canvas';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
// The factories use the game's foliage modules, which import data JSON as the bundler does.
registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
globalThis.document={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
const renderer={domElement:{height:900},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
const specs=[
 {id:'beach',x:-128.68,z:77.12,s:.8,y:-.44,box:[-38,38,-40,25]},
 {id:'forest',x:-112,z:-64,s:.62,y:.4,box:[-58,58,-70,20]},
 {id:'rose-garden',x:-100,z:20,s:.68,y:.4,box:[-60,60,-60,28]},
 // west of the arrival beach on the Greenhollow Frontier coast (Frontier local metres; world = local + atlas offset)
 {id:'shell-beach',region:'frontier-wilds-v1',x:152,z:176,s:.60,y:-.44,box:[-70,70,-65,50],outer:30,outerFill:7},
 {id:'azure-meadow',x:38,z:-85,s:.50,y:.4,box:[-65,65,-65,30]},
 {id:'hill-windmill',x:126,z:-85,s:.48,y:.4,box:[-65,65,-65,30],outer:30}
];
const round=n=>Math.round(n*1000)/1000,scenes=[];
// Morphological closing (a max then a min filter over a square r metres each way, 1 m grid).
function close(a,w,h,r){
 const pass=(src,pick)=>{const t=new Float64Array(src.length),out=new Float64Array(src.length);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let m=src[j*w+i];for(let k=Math.max(0,i-r);k<=Math.min(w-1,i+r);k++)m=pick(m,src[j*w+k]);t[j*w+i]=m;}
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let m=t[j*w+i];for(let k=Math.max(0,j-r);k<=Math.min(h-1,j+r);k++)m=pick(m,t[k*w+i]);out[j*w+i]=m;}
  return out;};
 const c=pass(pass(a,Math.max),Math.min);for(let k=0;k<a.length;k++)a[k]=round(c[k]);
}
for(const spec of specs){
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
 const scene={landmark:a.landmark?{x:round(spec.x+a.landmark.x*spec.s),z:round(spec.z+a.landmark.z*spec.s)}:null,...spec,bounds,feather:5,grid:{ox:bounds[0],oz:bounds[2],res,w,h},heights,trails,colliders,roads};
 // outer: the scene's own ground past its bounds (its banks, uplands and routes run on
 // beyond the frame), so the world can continue the scene's forms instead of cutting them
 if(spec.outer){const m=spec.outer,o=[bounds[0]-m,bounds[1]+m,bounds[2]-m,bounds[3]+m],r=1,ow=Math.ceil((o[1]-o[0])/r)+1,oh=Math.ceil((o[3]-o[2])/r)+1,oy=[];
  for(let j=0;j<oh;j++)for(let i=0;i<ow;i++)oy.push(round(a.height((o[0]+i*r-spec.x)/spec.s,(o[2]+j*r-spec.z)/spec.s)*spec.s+spec.y));
  // outerFill: gullies and slots narrower than about twice this many metres (a stair
 // ravine, the cove behind a wall) close over instead of running on as ravines
 if(spec.outerFill)close(oy,ow,oh,spec.outerFill);
 scene.outer={grid:{ox:o[0],oz:o[2],res:r,w:ow,h:oh},heights:oy};}
 if(a.shore)scene.shore=Array.from({length:Math.ceil((bounds[1]-bounds[0])/2)+1},(_,i)=>{const x=bounds[0]+i*2;return[round(x),round(spec.z+a.shore((x-spec.x)/spec.s)*spec.s)];});
 scenes.push(scene);console.log(spec.id,{colliders:colliders.length,roads:roads.length,bounds,meshes:a.root.children.length});
}
mkdirSync(new URL('../data/accepted-scenes/',import.meta.url),{recursive:true});
for(const scene of scenes)writeFileSync(new URL('../data/accepted-scenes/'+scene.id+'.json',import.meta.url),JSON.stringify(scene)+'\n');
writeFileSync(new URL('../data/accepted-scenes.json',import.meta.url),JSON.stringify({version:1,source:'00bed638a57b6217f675e1a279fcc8fcf769dda7',scenes:scenes.map(s=>s.id)})+'\n');
