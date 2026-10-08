import * as THREE from 'three';
import { searchQuestRoute, createQuestRouteCache, routeSegmentClear } from '../core/quest-route.js';
import { questNavigation } from '../core/quest-navigation.js';
import { trackedQuest } from '../core/quests.js';
import { disposeObject } from './dispose.js';

const SLICE_MS=1.5, LEAD_DISTANCE=2.4, REJOIN_DISTANCE=3;
const material=()=>new THREE.MeshBasicMaterial({color:0xffe3a3,transparent:true,opacity:.34,depthWrite:false,side:THREE.DoubleSide});
// Terrain sampling, search and ribbon assembly all yield. No large toggle/rebuild on the input stack.
function* ribbon(world,path) {
  const vertices=[],samples=[],lengths=[0];let distance=0;
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],len=Math.hypot(b.x-a.x,b.z-a.z);
    lengths.push(lengths[i-1]+len);if(len<.001)continue;
    const nx=-(b.z-a.z)/len*.075,nz=(b.x-a.x)/len*.075;
    for(let t=0;t<len;) {
      yield;
      const phase=distance%1.2,step=Math.min(len-t,.25,phase<.72?.72-phase:1.2-phase);
      if(step<1e-6){distance+=.00001;t+=.00001;continue;}
      if(phase<.72){
        const x=a.x+(b.x-a.x)*t/len,z=a.z+(b.z-a.z)*t/len;
        const ex=a.x+(b.x-a.x)*(t+step)/len,ez=a.z+(b.z-a.z)*(t+step)/len;
        const y=world.groundY(x,z)+.09,ey=world.groundY(ex,ez)+.09;
        samples.push({x,z,along:distance,start:vertices.length/3});
        vertices.push(x+nx,y,z+nz,x-nx,y,z-nz,ex+nx,ey,ez+nz,ex+nx,ey,ez+nz,x-nx,y,z-nz,ex-nx,ey,ez-nz);
      }
      distance+=step;t+=step;
    }
  }
  return {path,lengths,samples,positions:new Float32Array(vertices),end:{...path.at(-1),along:distance,start:vertices.length/3}};
}
function* plan(world,start,target,cache) {
  const path=yield* searchQuestRoute(world,start,target,{cache});
  return path.length?yield* ribbon(world,path):null;
}
export class QuestRoute {
  constructor(game,scene,hud) {
    Object.assign(this,{game,scene,hud});this.enabled=false;this.builds=0;this.saved=new Map();this.path=[];
    this.start={x:0,z:0};this.closest={x:0,z:0,along:0,index:0};this.points=[];
    this.leadPositions=new Float32Array(1536);this.maxSliceMs=0;
  }
  clear(){disposeObject(this.mesh);disposeObject(this.lead);this.mesh=this.lead=null;this.path.length=0;this.current=null;}
  cancel(){clearTimeout(this.timer);this.timer=null;this.work?.return();this.work=null;this.hud.tracker.setAttribute('aria-busy','false');}
  hide(){this.enabled=false;this.cancel();this.clear();this.hud.tracker.setAttribute('aria-pressed','false');}
  toggle(){if(this.enabled){this.hide();return;}this.enabled=true;this.id=trackedQuest(this.game.ch,this.game.data);this.targetClock=.25;this.hud.tracker.setAttribute('aria-pressed','true');this.update(0,true);}
  begin(target){this.cancel();this.work=plan(this.game.world,{x:this.game.player.x,z:this.game.player.z},target,this.cache);this.builds++;this.hud.tracker.setAttribute('aria-busy','true');this.schedule();}
  // Task yields also let a slow renderer finish navigation without hundreds of GPU frames.
  // Search is cancelled with its owning route; it never drains on the input event stack.
  schedule(){if(this.timer!==null&&this.timer!==undefined||!this.work)return;this.timer=setTimeout(()=>{this.timer=null;this.advance();this.schedule();},0);}
  install(result){
    this.clear();this.current=result;this.lastX=this.lastZ=null;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(result.positions,3));
    // Bounds cover the owning rule world; avoid a synchronous full-buffer sphere scan.
    const b=this.game.world.bounds;geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2),Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)+128);
    this.mesh=new THREE.Mesh(geometry,material());this.mesh.name='quest-ground-route';this.scene.add(this.mesh);
    const leadGeometry=new THREE.BufferGeometry(),attribute=new THREE.BufferAttribute(this.leadPositions,3);attribute.setUsage(THREE.DynamicDrawUsage);leadGeometry.setAttribute('position',attribute);leadGeometry.setDrawRange(0,0);
    this.lead=new THREE.Mesh(leadGeometry,material());this.lead.name='quest-ground-route-lead';this.lead.frustumCulled=false;this.scene.add(this.lead);
  }
  follow() {
    const route=this.current;if(!route)return false;
    const p=this.game.player,c=this.closest,world=this.game.world;let best=Infinity;
    // Projection is cheap. Validate only a short connection, never a line across an obstacle.
    for(let i=0;i<route.path.length-1;i++) {
      const a=route.path[i],b=route.path[i+1],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
      const t=len2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/len2)):0;
      const x=a.x+t*dx,z=a.z+t*dz,d=(x-p.x)**2+(z-p.z)**2;
      if(d<best){best=d;c.x=x;c.z=z;c.index=i;c.along=route.lengths[i]+Math.sqrt(len2)*t;}
    }
    if(best>REJOIN_DISTANCE**2||!routeSegmentClear(world,p,c)){this.mesh.visible=this.lead.visible=false;this.path.length=0;return false;}
    this.mesh.visible=this.lead.visible=true;
    this.start.x=p.x;this.start.z=p.z;this.path.length=0;this.path.push(this.start);
    for(let i=c.index+1;i<route.path.length;i++)this.path.push(route.path[i]);
    if(this.lastX===p.x&&this.lastZ===p.z)return true;
    this.lastX=p.x;this.lastZ=p.z;
    let lo=0,hi=route.samples.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(route.samples[mid].along<c.along+LEAD_DISTANCE)lo=mid+1;else hi=mid;}
    const cut=route.samples[lo]||route.end;
    this.mesh.geometry.setDrawRange(cut.start,route.positions.length/3-cut.start);
    const points=this.points;points.length=0;points.push(this.start,c);
    for(let i=c.index+1;i<route.path.length&&route.lengths[i]<cut.along-.001;i++)points.push(route.path[i]);points.push(cut);
    const positions=this.leadPositions;let count=0,distance=0;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.001)continue;
      const nx=-(b.z-a.z)/len*.075,nz=(b.x-a.x)/len*.075;
      for(let t=0;t<len;) {
        const phase=distance%1.2,step=Math.min(len-t,.25,phase<.72?.72-phase:1.2-phase);
        if(step<1e-6){t+=.00001;distance+=.00001;continue;}
        if(phase<.72){
          const x=a.x+(b.x-a.x)*t/len,z=a.z+(b.z-a.z)*t/len,ex=a.x+(b.x-a.x)*(t+step)/len,ez=a.z+(b.z-a.z)*(t+step)/len;
          const y=world.groundY(x,z)+.09,ey=world.groundY(ex,ez)+.09;
          if(count+18>positions.length)break;
          positions[count++]=x+nx;positions[count++]=y;positions[count++]=z+nz;
          positions[count++]=x-nx;positions[count++]=y;positions[count++]=z-nz;
          positions[count++]=ex+nx;positions[count++]=ey;positions[count++]=ez+nz;
          positions[count++]=ex+nx;positions[count++]=ey;positions[count++]=ez+nz;
          positions[count++]=x-nx;positions[count++]=y;positions[count++]=z-nz;
          positions[count++]=ex-nx;positions[count++]=ey;positions[count++]=ez-nz;
        }
        t+=step;distance+=step;
      }
    }
    const attribute=this.lead.geometry.getAttribute('position');attribute.clearUpdateRanges();attribute.addUpdateRange(0,count);attribute.needsUpdate=true;this.lead.geometry.setDrawRange(0,count/3);return true;
  }
  update(dt,force=false) {
    if(!this.enabled)return;
    const g=this.game,id=trackedQuest(g.ch,g.data);if(id!==this.id||!id){this.hide();return;}
    if(this.world!==g.world){this.cancel();this.clear();this.saved.clear();this.world=g.world;this.cache=createQuestRouteCache(g.world);force=true;}
    this.targetClock+=dt;this.retryClock=(this.retryClock||0)+dt;
    if(force||this.targetClock>=.25){
      this.targetClock=0;const target=questNavigation(g,id);
      if(!target?.spatial){this.hide();this.hud.toast(target?.label||'เปิดสมุดภารกิจเพื่อดูขั้นตอนต่อไป','#ecd69c');return;}
      const key=JSON.stringify([id,g.world.data.id,target.world,target.x,target.z]);this.target=target;
      if(force||key!==this.key){
        this.key=key;this.cancel();this.clear();
        const cached=this.saved.get(key);if(cached)this.install(cached);
        if(!cached||!this.follow())this.begin(target);
      }
    }
    if(this.current&&!this.follow()&&!this.work&&this.retryClock>=1){this.retryClock=0;this.begin(this.target);}
    if(!force)this.advance();
  }
  advance() {
    if(!this.work)return;
    if(trackedQuest(this.game.ch,this.game.data)!==this.id){this.hide();return;}
    if(this.world!==this.game.world){this.update(0,true);return;}
    const started=performance.now();let steps=0,result;
    do {result=this.work.next();if(result.done)break;}while(++steps<512&&performance.now()-started<SLICE_MS);
    this.maxSliceMs=Math.max(this.maxSliceMs,performance.now()-started);
    if(result.done){
      clearTimeout(this.timer);this.timer=null;this.work=null;this.hud.tracker.setAttribute('aria-busy','false');
      if(!result.value){this.hide();this.hud.toast('ยังหาเส้นทางเดินไปเป้าหมายไม่ได้ ลองขยับแล้วแตะอีกครั้ง','#ecd69c');return;}
      if(this.saved.size>=4&&!this.saved.has(this.key))this.saved.delete(this.saved.keys().next().value);
      this.saved.set(this.key,result.value);this.lastX=this.lastZ=null;this.install(result.value);this.follow();
    }
  }
  dispose(){this.hide();this.saved.clear();this.cache=null;this.world=null;}
}
