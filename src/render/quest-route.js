import * as THREE from 'three';
import { findQuestRoute } from '../core/quest-route.js';
import { questNavigation } from '../core/quest-navigation.js';
import { trackedQuest } from '../core/quests.js';
import { disposeObject } from './dispose.js';
export class QuestRoute {
  constructor(game, scene, hud) {Object.assign(this,{game,scene,hud});this.enabled=false;this.elapsed=0;this.builds=0;}
  clear(){disposeObject(this.mesh);this.mesh=null;this.path=[];}
  hide(){this.enabled=false;this.clear();this.hud.tracker.setAttribute('aria-pressed','false');}
  toggle(){if(this.enabled){this.hide();return;}this.enabled=true;this.elapsed=2;this.id=trackedQuest(this.game.ch,this.game.data);this.update(0,true);}
  update(dt,force=false) {
    if(!this.enabled)return;
    this.elapsed+=dt;
    const g=this.game,id=trackedQuest(g.ch,g.data);
    if(id!==this.id||!id){this.hide();return;}
    if(this.world!==g.world){this.clear();this.elapsed=2;this.world=g.world;force=true;}
    if(!force&&this.elapsed<2)return;
    this.elapsed=0;
    const target=questNavigation(g,id),key=JSON.stringify([id,g.world.data.id,target?.world,target?.x,target?.z]);
    if(!target?.spatial){this.hide();this.hud.toast(target?.label||'เปิดสมุดภารกิจเพื่อดูขั้นตอนต่อไป','#ecd69c');return;}
    const p=g.player;
    if(!force&&key===this.key&&Math.hypot(p.x-this.start.x,p.z-this.start.z)<4)return;
    this.key=key;this.start={x:p.x,z:p.z};this.clear();
    this.path=findQuestRoute(g.world,this.start,target);this.builds++;
    if(!this.path.length){this.hide();this.hud.toast('ยังหาเส้นทางเดินไปเป้าหมายไม่ได้ ลองขยับแล้วแตะอีกครั้ง','#ecd69c');return;}
    const vertices=[];
    // One merged translucent ribbon, small dashes sampled on the standing surface.
    let distance=0;
    for(let i=1;i<this.path.length;i++) {
      const a=this.path[i-1],b=this.path[i],len=Math.hypot(b.x-a.x,b.z-a.z);
      if(len<.001)continue;
      const nx=-(b.z-a.z)/len*.075,nz=(b.x-a.x)/len*.075;
      for(let t=0;t<len;) {
        const phase=distance%1.2,step=Math.min(len-t,.25,phase<.72?.72-phase:1.2-phase);
        if(step<1e-6){distance+=.00001;t+=.00001;continue;}
        if(phase<.72){
          const x=a.x+(b.x-a.x)*t/len,z=a.z+(b.z-a.z)*t/len;
          const ex=a.x+(b.x-a.x)*(t+step)/len,ez=a.z+(b.z-a.z)*(t+step)/len;
          const y=g.world.groundY(x,z)+.09,ey=g.world.groundY(ex,ez)+.09;
          vertices.push(x+nx,y,z+nz,x-nx,y,z-nz,ex+nx,ey,ez+nz,ex+nx,ey,ez+nz,x-nx,y,z-nz,ex-nx,ey,ez-nz);
        }
        distance+=step;t+=step;
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeBoundingSphere();
    const material=new THREE.MeshBasicMaterial({color:0xffe3a3,transparent:true,opacity:.34,depthWrite:false,side:THREE.DoubleSide});
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.name='quest-ground-route';this.scene.add(this.mesh);
    this.hud.tracker.setAttribute('aria-pressed','true');
  }
  dispose(){this.hide();}
}
