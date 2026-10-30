// Original low-noise prototypes: a clear hit footprint, stone silhouettes and one aura edge.
// Shared geometry lives for the view; per-effect materials are released on removal.
import * as THREE from 'three';
import {disposeObject} from './dispose.js';
import FX from '../../data/combat-fx.json';
const mat=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
export class FrontierFx {
 constructor(scene,ground){this.scene=scene;this.ground=ground;this.live=new Map();this.seen=new Set();this.pulses=[];this.ring=new THREE.RingGeometry(.965,1,48);this.stone=new THREE.OctahedronGeometry(1,0);this.plane=new THREE.PlaneGeometry(1,1);this.arrow=new THREE.CylinderGeometry(.025,.025,.8,4);for(const g of [this.ring,this.stone,this.plane,this.arrow])g.userData.shared=true;this.channel=null;}
 gy(x,z){return this.ground.groundY?.(x,z)||0;}
 event(e){
  if(!['lineStrike','guardStance','healCast','wallWindup'].includes(e.type))return;
  const cfg=FX.frontier;
  const obj=new THREE.Mesh(e.type==='lineStrike'?this.plane:this.ring,mat(e.type==='lineStrike'?cfg.lineColor:e.type==='healCast'?cfg.healColor:cfg.guardColor,.8));
  obj.rotation.x=-Math.PI/2;
  if(e.type==='lineStrike'){obj.scale.set(e.width,e.range,1);obj.position.set(e.x+Math.sin(e.angle)*e.range/2,this.gy(e.x,e.z)+.04,e.z+Math.cos(e.angle)*e.range/2);obj.rotation.z=-e.angle;}
  else{obj.scale.setScalar(e.radius||.9);obj.position.set(e.x,this.gy(e.x,e.z)+.08,e.z);}
  this.scene.add(obj);this.pulses.push({obj,t:0,dur:e.duration||(e.type==='healCast'?cfg.healLife:cfg.lineLife)});
 }
 sync(game,dt,time){
  const seen=this.seen,cfg=FX.frontier;seen.clear();
  for(const a of game.areas||[])if(a.wallHp>0){
   const id='wall'+a.id;seen.add(id);let obj=this.live.get(id);
   if(!obj){obj=new THREE.Group();const stone=new THREE.Mesh(this.stone,new THREE.MeshBasicMaterial({color:cfg.wallColor}));stone.scale.set(a.r,cfg.wallHeight,a.skill.wall.thickness/2);stone.position.y=cfg.wallHeight;obj.add(stone);const edge=new THREE.LineSegments(new THREE.EdgesGeometry(this.stone),new THREE.LineBasicMaterial({color:cfg.wallEdge}));edge.scale.copy(stone.scale);edge.position.copy(stone.position);obj.add(edge);this.scene.add(obj);this.live.set(id,obj);}
   obj.position.set(a.x,this.gy(a.x,a.z),a.z);obj.scale.y=Math.min(1,a.t/cfg.wallRise);obj.rotation.y=a.angle-Math.PI/2;
  }
  // Wall of Faith (stand-in): an upright pane of light across the aim, rising in and fading out
  for(const a of game.areas||[])if(a.lightWall){
   const id='faith'+a.id;seen.add(id);let obj=this.live.get(id);
   if(!obj){obj=new THREE.Group();const pane=new THREE.Mesh(this.plane,mat(cfg.faithColor,cfg.faithOpacity));pane.scale.set(a.radius*2,cfg.faithHeight,1);pane.position.y=cfg.faithHeight/2;obj.add(pane);const base=new THREE.Mesh(this.plane,mat(cfg.faithEdge,.7));base.rotation.x=-Math.PI/2;base.scale.set(a.radius*2,a.lightWall.thickness,1);base.position.y=.05;obj.add(base);this.scene.add(obj);this.live.set(id,obj);}
   obj.position.set(a.x,this.gy(a.x,a.z),a.z);obj.rotation.y=a.angle-Math.PI/2;
   const k=Math.min(1,a.t/cfg.faithRise,(a.duration-a.t)/cfg.faithRise);obj.scale.y=Math.max(.01,k);obj.children[0].material.opacity=cfg.faithOpacity*(.85+.15*Math.sin(time*4));
  }
  // Shield Fortress (stand-in): the guarded front arc on the ground while the shield is held up
  const c=game.player?.channeling;
  if(c?.skill.kind==='guard_hold'){
   const id='fort';seen.add(id);let obj=this.live.get(id);
   if(!obj){const arc=c.skill.guard.arc*Math.PI/180;obj=new THREE.Mesh(new THREE.RingGeometry(.55,1,24,1,-Math.PI/2-arc/2,arc),mat(cfg.fortColor,cfg.fortOpacity));obj.rotation.x=-Math.PI/2;this.scene.add(obj);this.live.set(id,obj);}
   const p=game.player;obj.position.set(p.x,this.gy(p.x,p.z)+.05,p.z);obj.scale.setScalar(cfg.fortRadius);obj.rotation.z=p.facing; // laid flat, the arc's middle points along the facing
  }
  // Arrow Rain and Flame Stream are drawn by the skill effects (skill-fx.js)
  for(const a of Object.values(game.player?.auras||{})){
   const id='aura'+a.slot;seen.add(id);let obj=this.live.get(id);
   if(!obj){obj=new THREE.Mesh(this.ring,mat(cfg.auraColor,cfg.auraOpacity));obj.rotation.x=-Math.PI/2;this.scene.add(obj);this.live.set(id,obj);}
   const p=game.player;obj.position.set(p.x,this.gy(p.x,p.z)+.035,p.z);obj.scale.setScalar(a.skill.radius);obj.material.opacity=cfg.auraOpacity*(.9+.1*Math.sin(time*3));
  }
  for(const [id,obj]of this.live)if(!seen.has(id)){disposeObject(obj);this.live.delete(id);}
  for(let i=this.pulses.length-1;i>=0;i--){const a=this.pulses[i];a.t+=dt;a.obj.material.opacity=Math.max(0,1-a.t/a.dur);if(a.t>=a.dur){disposeObject(a.obj);this.pulses.splice(i,1);}}
 }
 clear(){for(const obj of this.live.values())disposeObject(obj);this.live.clear();for(const a of this.pulses)disposeObject(a.obj);this.pulses=[];}
 dispose(){this.clear();for(const g of [this.ring,this.stone,this.plane,this.arrow])g.dispose();}
}
