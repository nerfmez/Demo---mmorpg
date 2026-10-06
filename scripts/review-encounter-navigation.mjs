import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {encounterLayout} from '../src/core/encounters.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='95f2a19184add76ed90428ce434b882477b8c63d';
const show=path=>execFileSync('git',['show',base+':'+path],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const oldConfig=JSON.parse(show('data/encounters.json'));
const oldSource=show('src/core/encounters.js').replace("'./rng.js'",JSON.stringify(pathToFileURL(resolve(root,'src/core/rng.js')).href));
const {encounterLayout:oldLayout}=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));

const data=loadData(),report=[];
class Heap {a=[];push(x){let a=this.a,i=a.length;a.push(x);while(i){let p=(i-1)>>1;if(a[p][0]<=x[0])break;a[i]=a[p];i=p;}a[i]=x;}pop(){let a=this.a,r=a[0],x=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(x[0]<=a[c][0])break;a[i]=a[c];i=c;}a[i]=x;}return r;}}
for(const [id,wd]of Object.entries(data.maps)){
 const w=createWorld(wd),b=w.bounds,step=2,cols=Math.floor((b.maxX-b.minX)/step)+1,rows=Math.floor((b.maxZ-b.minZ)/step)+1,N=cols*rows;
 const coords=i=>[b.minX+(i%cols)*step,b.minZ+Math.floor(i/cols)*step];
 const free=new Uint8Array(N),safe=new Uint8Array(N),edgeCache=new Uint8Array(N*8);
 for(let i=0;i<N;i++){const p=coords(i);free[i]=Number(w.isFree(...p,.45));safe[i]=Number(w.isSafe(...p));}
 const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
 function line(a,c){let [x,z]=a;const n=Math.max(1,Math.ceil(Math.hypot(c[0]-x,c[1]-z)/.4)),dx=(c[0]-x)/n,dz=(c[1]-z)/n;for(let k=0;k<n;k++){const p=w.move(x,z,.45,dx,dz);if(Math.hypot(p.x-x-dx,p.z-z-dz)>.15)return false;x=p.x;z=p.z;}return Math.hypot(x-c[0],z-c[1])<.2;}
 const start=[];for(let i=0;i<N;i++)if(free[i]){const p=coords(i);if(Math.hypot(p[0]-wd.playerSpawn[0],p[1]-wd.playerSpawn[1])<6&&line(wd.playerSpawn,p))start.push(i);}
 const bosses=(wd.bosses||[]).map(p=>({x:p.pos[0],z:p.pos[1],monster:p.monster,zone:w.zoneAt(...p.pos).id,level:[p.level,p.level],boss:true}));
 const variants={before:[...oldLayout(w,{...data,encounters:oldConfig}).points,...bosses],after:[...encounterLayout(w,data).points,...bosses]};
 const comparisons={};
 for(const [variant,points]of Object.entries(variants)){
  const hazard=new Uint8Array(N),cost=new Float64Array(N).fill(Infinity),parent=new Int32Array(N).fill(-1),heap=new Heap();
  for(const p of points){const def=data.monsters.monsters[p.monster],radius=def.aggroRange+def.radius+data.encounters.placement.wanderMargin+Math.SQRT2+.45;
   const x0=Math.max(0,Math.floor((p.x-radius-b.minX)/step)),x1=Math.min(cols-1,Math.ceil((p.x+radius-b.minX)/step)),z0=Math.max(0,Math.floor((p.z-radius-b.minZ)/step)),z1=Math.min(rows-1,Math.ceil((p.z+radius-b.minZ)/step));
   for(let zz=z0;zz<=z1;zz++)for(let xx=x0;xx<=x1;xx++){let i=zz*cols+xx;if(!free[i]||safe[i])continue;const q=coords(i);if(Math.hypot(q[0]-p.x,q[1]-p.z)<=radius)hazard[i]=Math.max(hazard[i],p.level[1]);}
  }
  for(const i of start){cost[i]=hazard[i]*1e6;heap.push([cost[i],i]);}
  while(heap.a.length){const [c,i]=heap.pop();if(c!==cost[i])continue;const xx=i%cols,zz=Math.floor(i/cols),p=coords(i);
   for(let d=0;d<dirs.length;d++){const [dx,dz]=dirs[d],x=xx+dx,z=zz+dz;if(x<0||x>=cols||z<0||z>=rows)continue;const j=z*cols+x;if(!free[j])continue;
    const peak=Math.max(Math.floor(c/1e6),hazard[j]),dist=c%1e6+Math.hypot(dx,dz)*step,nc=peak*1e6+dist;if(nc>=cost[j])continue;
    let edge=edgeCache[i*8+d];if(!edge){edge=line(p,coords(j))?1:2;edgeCache[i*8+d]=edge;}if(edge!==1)continue;
    cost[j]=nc;parent[j]=i;heap.push([nc,j]);
   }
  }
  const out=points.map(p=>{let best=Infinity,node=-1;const cx=Math.round((p.x-b.minX)/step),cz=Math.round((p.z-b.minZ)/step);
   for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const x=cx+dx,z=cz+dz;if(x<0||x>=cols||z<0||z>=rows)continue;const i=z*cols+x;if(!Number.isFinite(cost[i]))continue;const q=coords(i);if(!line(q,[p.x,p.z]))continue;
    let goalPeak=0;for(const m of points){const def=data.monsters.monsters[m.monster];const dx=p.x-q[0],dz=p.z-q[1],len2=dx*dx+dz*dz,t=len2?Math.max(0,Math.min(1,((m.x-q[0])*dx+(m.z-q[1])*dz)/len2)):0;if(Math.hypot(q[0]+t*dx-m.x,q[1]+t*dz-m.z)<def.aggroRange+def.radius+data.encounters.placement.wanderMargin)goalPeak=Math.max(goalPeak,m.level[1]);}
    const v=Math.max(Math.floor(cost[i]/1e6),goalPeak)*1e6+cost[i]%1e6+Math.hypot(q[0]-p.x,q[1]-p.z);if(v<best){best=v;node=i;}
   }
   let path=[];if(node>=0){for(let i=node;i>=0;i=parent[i])path.push(coords(i));path.reverse();path.unshift(wd.playerSpawn);path.push([p.x,p.z]);}
   return {...p,reachable:node>=0,peakThreatLevel:node>=0?Math.floor(best/1e6):null,walkMetres:node>=0?+(best%1e6).toFixed(1):null,path};
  });
  comparisons[variant]={points:out};console.log(id,variant,'reachable',out.filter(p=>p.reachable).length+'/'+out.length);
 }
 const groups=wd.spawns.map(s=>{const key=s.zone+':'+s.monster,obj={key,monster:s.monster,zone:s.zone,level:s.level};for(const v of ['before','after']){const group=comparisons[v].points.filter(p=>p.monster===s.monster&&p.zone===s.zone);obj[v]={count:group.length,accessible:group.filter(p=>p.reachable).length,minPeak:Math.min(...group.filter(p=>p.reachable).map(p=>p.peakThreatLevel)),pointsAboveOwnBand:group.filter(p=>p.peakThreatLevel>s.level[1]).length};}return obj;});
 report.push({map:id,method:'Directed 2m grid. Every accepted edge checked by actual world.move in <=0.4m steps. Minimax paths minimise maximum possible unprovoked aggro level, with a preference for shorter routes at each visited cell; lengths are not claimed globally optimal. Hazard envelopes include 5.3m idle-wander allowance plus half-cell diagonal and player radius. Not a combat or chased-escape simulation.',groups,...comparisons});
}
fs.writeFileSync(process.argv[2] || 'navigation-review.json',JSON.stringify(report));
for(const r of report)console.log(r.map,'groups that still require higher-than-own-band exposure',r.groups.filter(g=>g.after.minPeak>g.level[1]).map(g=>[g.key,g.level,g.after]));
