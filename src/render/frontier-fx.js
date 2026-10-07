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
  for(const a of game.areas||[])if(a.kind==='arrow_rain'){
   const id='rain'+a.id;seen.add(id);let obj=this.live.get(id);
   if(!obj){obj=new THREE.Group();for(let i=0;i<cfg.rainArrows;i++){const angle=i*2.39996,r=Math.sqrt(i/cfg.rainArrows)*a.radius;const arrow=new THREE.Mesh(this.arrow,mat(cfg.rainColor));arrow.position.set(Math.sin(angle)*r,.4,Math.cos(angle)*r);obj.add(arrow);}this.scene.add(obj);this.live.set(id,obj);}
   const fall=Math.max(0,Math.min(1,(a.t-a.delay+cfg.rainFall)/cfg.rainFall));obj.visible=fall>0;obj.position.set(a.x,this.gy(a.x,a.z)+cfg.rainHeight*(1-fall),a.z);obj.scale.y=a.t>a.delay?Math.max(0,1-(a.t-a.delay)/a.duration):1;
  }
  for(const a of Object.values(game.player?.auras||{})){
   const id='aura'+a.slot;seen.add(id);let obj=this.live.get(id);
   if(!obj){obj=new THREE.Mesh(this.ring,mat(cfg.auraColor,cfg.auraOpacity));obj.rotation.x=-Math.PI/2;this.scene.add(obj);this.live.set(id,obj);}
   const p=game.player;obj.position.set(p.x,this.gy(p.x,p.z)+.035,p.z);obj.scale.setScalar(a.skill.radius);obj.material.opacity=cfg.auraOpacity*(.9+.1*Math.sin(time*3));
  }
  for(const [id,obj]of this.live)if(!seen.has(id)){disposeObject(obj);this.live.delete(id);}
  const c=game.player?.channeling;
  if(c){
   if(!this.channel){
    const shape=new THREE.Shape();shape.moveTo(0,0);const arc=c.skill.arc*Math.PI/180;const steps=16;for(let i=0;i<=steps;i++){const a=-arc/2+arc*i/steps;shape.lineTo(Math.sin(a),Math.cos(a));}shape.closePath();
    const root=new THREE.Group();const fire=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{time:{value:time},outer:{value:new THREE.Color(cfg.flameColor)},inner:{value:new THREE.Color(cfg.flameCore)},opacity:{value:cfg.flameOpacity}},
      vertexShader:'varying vec2 flow;void main(){flow=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 flow;uniform float time,opacity;uniform vec3 outer,inner;
       void main(){float along=flow.y;float lateral=flow.x/max(.08,along);
        float wave=sin(lateral*19.+along*13.-time*12.)*.13+sin(lateral*31.-along*21.+time*8.)*.07;
        float edge=1.-abs(lateral)/.52;float tip=1.-along+wave;
        if(edge+wave<.06||tip<.06)discard;
        float heat=clamp(.7-along*.4+wave*1.8,0.,1.);
        gl_FragColor=vec4(mix(outer,inner,step(.57,heat)),opacity*clamp(edge*3.,.15,1.)*clamp(tip*5.,0.,1.));}`});
    const body=new THREE.Mesh(new THREE.ShapeGeometry(shape),fire);body.rotation.x=Math.PI/2;root.add(body);
    const core=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat(cfg.flameCore,.12));core.rotation.x=Math.PI/2;core.scale.setScalar(.68);core.position.y=.03;root.add(core);
    this.channel={root,body,core};this.scene.add(root);
   }
   const p=game.player,r=this.channel.root;r.position.set(p.x,this.gy(p.x,p.z)+cfg.flameHeight,p.z);r.rotation.y=p.facing;
   r.scale.setScalar(c.skill.range);r.visible=c.t>=c.skill.castTime;this.channel.body.material.uniforms.time.value=time;
  }else if(this.channel){disposeObject(this.channel.root);this.channel=null;}
  for(let i=this.pulses.length-1;i>=0;i--){const a=this.pulses[i];a.t+=dt;a.obj.material.opacity=Math.max(0,1-a.t/a.dur);if(a.t>=a.dur){disposeObject(a.obj);this.pulses.splice(i,1);}}
 }
 clear(){for(const obj of this.live.values())disposeObject(obj);this.live.clear();for(const a of this.pulses)disposeObject(a.obj);this.pulses=[];if(this.channel)disposeObject(this.channel.root);this.channel=null;}
 dispose(){this.clear();for(const g of [this.ring,this.stone,this.plane,this.arrow])g.dispose();}
}
