// Presentation-only geometry keyed by gear base ID. Grade never changes the model.
import * as THREE from 'three';
import { hasModel } from './models.js';
const rod=(r,len)=>new THREE.CylinderGeometry(r,r,len,6).rotateX(Math.PI/2);
const plate=(points,depth=.018)=>{
 const s=new THREE.Shape(); points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,steps:1}).translate(0,0,-depth/2).rotateX(Math.PI/2);
};
const tube=(pts,r=.016)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),12,r,5,false);
const add=(rb,g,c,pos=[0,0,0],extra={})=>rb.add('weapon',g,c,{pos,...extra});

export function buildWeapon(rb,kind,id) {
 if(!kind)return;
 id ||= {sword:'rusty_sword',dagger:'fang_dagger',greatblade:'horn_greatblade',axe:'crag_axe',bow:'old_bow',staff:'apprentice_staff',wand:'spore_wand'}[kind];
 rb.bone('weapon','handR',[0,-.04,0]);
 if(hasModel('weapons',id))return id; // an imported model is attached after rb.build()
 if(['sword','dagger','greatblade'].includes(kind)){
  const blades={
   rusty_sword:[[-.025,.08],[-.03,.64],[0,.87],[.034,.69],[.016,.57],[.034,.52],[.027,.08]],
   tusk_blade:[[-.03,.09],[-.015,.36],[.05,.59],[.20,.87],[.14,.49],[.07,.24],[.04,.09]],
   fang_dagger:[[-.027,.08],[-.04,.30],[.09,.51],[.06,.27],[.024,.08]],
   greyfang_sabre:[[-.025,.08],[-.02,.52],[.05,.81],[.17,.99],[.095,.71],[.047,.43],[.03,.08]],
   horn_greatblade:[[-.06,.09],[-.09,.76],[-.04,1.06],[.14,1.15],[.12,.75],[.055,.09]]
  };
  add(rb,plate(blades[id]||blades.rusty_sword),id==='tusk_blade'?'#ebd5a1':id==='rusty_sword'?'#adb2a8':'#cbd9d7');
  const guard=id==='horn_greatblade'?.26:id==='fang_dagger'?.13:.18;
  add(rb,new THREE.BoxGeometry(guard,.036,.044),'#a18a59',[0,0,.07]);
  add(rb,rod(.02,.14),id==='greyfang_sabre'?'#705568':'#805b3c');
  if(id==='horn_greatblade'||id==='fang_dagger'){
   for(const side of [-1,1]) add(rb,tube([[side*guard*.45,0,.06],[side*(guard*.65),0,.14],[side*guard*.55,0,.24]],.024),'#e9d4a6');
  }
  if(id==='rusty_sword')add(rb,plate([[-.022,.32],[.01,.37],[-.006,.5]],.021),'#a37d55');
  if(id==='greyfang_sabre')add(rb,new THREE.OctahedronGeometry(.03),'#b1d5db',[0,.02,.065],{glow:true});
  if(id==='horn_greatblade')add(rb,plate([[-.022,.49],[.035,.65],[.006,.65],[.035,.79],[-.035,.60],[0,.6]],.021),'#6c979b');
 } else if(kind==='axe'){
  add(rb,rod(.025,.84),'#896548',[0,0,.3]);
  add(rb,plate([[-.20,.53],[-.17,.76],[.015,.86],[.23,.79],[.22,.55],[.04,.63]],.055),'#8b9896');
  add(rb,plate([[.18,.57],[.23,.79],[.20,.83],[.28,.80],[.27,.52]],.06),'#d1d6c3');
  add(rb,new THREE.CylinderGeometry(.037,.037,.065,6),'#b29b67',[0,0,.7]);
 } else if(kind==='bow'){
  if(id==='storm_bow'){
   for(const side of [-1,1]){
    add(rb,tube([[0,0,.1],[0,side*.15,.20],[0,side*.28,.1],[0,side*.38,.2],[0,side*.5,-.12]],.027),'#6d96a4');
    add(rb,new THREE.ConeGeometry(.05,.19,4),'#d5c58b',[0,side*.34,.14],{rot:[0,0,side*Math.PI]});
   }
   add(rb,new THREE.OctahedronGeometry(.044),'#9bd7d3',[0,0,.21],{glow:true});
  } else if(id==='hunter_bow'){
   add(rb,tube([[0,-.47,-.15],[0,-.36,.04],[0,-.23,.21],[0,0,.12],[0,.23,.21],[0,.36,.04],[0,.47,-.15]],.025),'#77915f');
   for(const side of [-1,1])add(rb,new THREE.ConeGeometry(.04,.15,5),'#e1d3a9',[0,side*.40,-.05],{rot:[0,0,side<0?Math.PI:0]});
  } else {
   add(rb,new THREE.TorusGeometry(.42,.022,5,18,Math.PI*.9).rotateZ(Math.PI/2-Math.PI*.45),'#9b7953',[0,0,.1],{rot:[0,Math.PI/2,0]});
  }
  const len=id==='storm_bow'?1:id==='hunter_bow'?.94:.80;
  add(rb,new THREE.CylinderGeometry(.004,.004,len,3),'#eee4c6',[0,0,id==='old_bow'?-.18:-.15],{plain:true});
  add(rb,new THREE.CylinderGeometry(.038,.038,.13,6),'#77503c',[0,0,.13]);
 } else {
  const len=kind==='wand'?.50:1.35,tip=len*.85;
  add(rb,rod(.024,len),id==='wisp_staff'?'#729590':id==='ancient_staff'?'#baa66b':'#916d4e',[0,0,len*.35]);
  if(id==='spore_wand'){
   for(const [x,z,r] of [[0,tip,.13],[-.11,tip-.035,.075],[.10,tip+.03,.085]]){
    add(rb,new THREE.SphereGeometry(r,9,5,0,Math.PI*2,0,Math.PI*.5).rotateX(Math.PI/2),'#b17d79',[x,0,z]);
    add(rb,new THREE.SphereGeometry(r*.23,6,4),'#eed6a1',[x+.02,-r*.35,z+r*.76],{plain:true});
   }
  }else if(id==='wisp_staff'){
   add(rb,new THREE.TorusGeometry(.105,.022,5,15,Math.PI*1.6).rotateX(Math.PI/2).rotateY(-.62),'#c3b27d',[0,0,tip]);
   add(rb,new THREE.ConeGeometry(.058,.17,6).rotateX(Math.PI/2),'#82dae0',[0,0,tip+.025],{glow:true});
  }else if(id==='ancient_staff'){
   add(rb,new THREE.TorusGeometry(.14,.021,5,16).rotateX(Math.PI/2),'#c8b074',[0,0,tip]);
   add(rb,new THREE.OctahedronGeometry(.076),'#90cfbf',[0,0,tip],{glow:true});
   for(const [x,z] of [[-.19,0],[.19,0],[0,-.19],[0,.19]])add(rb,new THREE.OctahedronGeometry(.045),'#dfce93',[x,0,tip+z]);
  }else{
   add(rb,new THREE.TorusGeometry(.083,.023,5,6).rotateX(Math.PI/2),'#b99461',[0,0,tip]);
   add(rb,new THREE.OctahedronGeometry(.063),'#e5b874',[0,0,tip],{plain:true});
  }
 }
}

export function equipmentDetails(rb,bases={}) {
 if(bases.armor==='storm_mantle'){
  const s=new THREE.Shape();s.moveTo(-.18,.25);s.lineTo(.18,.25);s.lineTo(.32,-.55);s.lineTo(.12,-.46);s.lineTo(0,-.67);s.lineTo(-.13,-.46);s.lineTo(-.32,-.55);s.closePath();
  rb.add('chest',new THREE.ShapeGeometry(s),'#5a879f',{pos:[0,0,-.17],rot:[.15,0,0]});
  for(const side of [-1,1])rb.add('chest',new THREE.BoxGeometry(.02,.44,.008),'#d5cea0',{pos:[side*.19,-.22,-.24],rot:[.15,0,side*.15],plain:true});
 }
 const charm=bases.charm;
 if(!charm)return;
 // Pendants sit below the scarf; the ring is worn on the right hand.
 if(charm==='ancient_ring'){
  rb.add('handR',new THREE.TorusGeometry(.025,.008,5,10).rotateY(Math.PI/2),'#d9b970',{pos:[-.03,-.03,.01],plain:true});
  rb.add('handR',new THREE.OctahedronGeometry(.025),'#86bdb8',{pos:[-.05,-.025,.01],glow:true});return;
 }
 rb.add('chest',new THREE.TorusGeometry(.082,.005,3,12).scale(1,1.55,1),'#c3ae77',{pos:[0,.07,.15],plain:true});
 const opts={pos:[0,-.055,.158],plain:true};
 if(charm==='tusk_charm'){
  for(const side of [-1,1])rb.add('chest',new THREE.ConeGeometry(.017,.074,5),'#e9d4a5',{pos:[side*.026,-.068,.166],rot:[0,0,side*.6],plain:true});
 }else if(charm==='wisp_pendant'){
  rb.add('chest',new THREE.TorusGeometry(.038,.008,4,10),'#c9b783',opts);
  rb.add('chest',new THREE.OctahedronGeometry(.027),'#9bddcf',{...opts,glow:true});
 }else if(charm==='spore_amulet'){
  rb.add('chest',new THREE.SphereGeometry(.037,7,4,0,Math.PI*2,0,Math.PI/2).scale(1,.6,.5),'#b88378',opts);
  rb.add('chest',new THREE.CylinderGeometry(.013,.019,.045,5),'#decc9b',{pos:[0,-.08,.157],plain:true});
 }else if(charm==='feather_charm'){
  rb.add('chest',new THREE.ConeGeometry(.025,.11,4).scale(1,1,.24),'#d7bb7b',{...opts,rot:[0,0,-.45]});
 }else if(charm==='golem_amulet'){
  rb.add('chest',new THREE.DodecahedronGeometry(.044),'#84968c',opts);
  rb.add('chest',new THREE.OctahedronGeometry(.02),'#e8b867',{pos:[0,-.055,.19],glow:true});
 }else if(charm==='pearl_pendant'){
  rb.add('chest',new THREE.SphereGeometry(.03,8,6),'#f2eefc',{...opts,glow:true});
 }
}

