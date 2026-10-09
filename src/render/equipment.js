// Presentation-only geometry keyed by gear base ID. Grade never changes the model.
import * as THREE from 'three';
import { hasModel } from './models.js';
const rod=(r,len)=>new THREE.CylinderGeometry(r,r,len,6).rotateX(Math.PI/2);
const plate=(points,depth=.018)=>{
 const s=new THREE.Shape(); points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,steps:1}).translate(0,0,-depth/2).rotateX(Math.PI/2);
};
const tube=(pts,r=.016)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),12,r,5,false);
let BONE='weapon'; // the hand bone buildWeapon is writing to
const add=(rb,g,c,pos=[0,0,0],extra={})=>rb.add(BONE,g,c,{pos,...extra});

/** A weapon in the right hand (bone 'weapon'), or a second light weapon in the left ('offhand'). */
export function buildWeapon(rb,kind,id,bone='weapon',hand='handR') {
 if(!kind)return;
 id ||= {sword:'rusty_sword',dagger:'fang_dagger',greatblade:'horn_greatblade',axe:'crag_axe',mace:'beetle_maul',bow:'old_bow',staff:'apprentice_staff',wand:'spore_wand'}[kind];
 BONE=bone;
 rb.bone(bone,hand,[0,-.04,0]);
 if(hasModel('weapons',id))return id; // an imported model is attached after rb.build()
 if(kind==='mace'){
  add(rb,rod(.024,.62),'#7a5a3e',[0,0,.22]);
  add(rb,new THREE.DodecahedronGeometry(.105),'#5f7f5b',[0,0,.58]);
  for(const [x,y,z] of [[.1,0,.6],[-.1,0,.6],[0,.1,.6],[0,-.1,.6],[0,0,.7]])add(rb,new THREE.ConeGeometry(.03,.07,5).rotateX(z>.65?Math.PI/2:0).rotateZ(x>0?-Math.PI/2:x<0?Math.PI/2:y<0?Math.PI:0),'#d9c9a0',[x,y,z]);
  add(rb,new THREE.CylinderGeometry(.034,.034,.05,6),'#b29b67',[0,0,-.05]);
  return;
 }
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
   // limbs along Y, belly toward +Z with the grip at z .13, like the other bows
   add(rb,new THREE.TorusGeometry(.42,.022,5,18,Math.PI*.9).rotateZ(-Math.PI*.45).rotateY(-Math.PI/2),'#9b7953',[0,0,-.29]);
  }
  const len=id==='storm_bow'?1:id==='hunter_bow'?.94:.80;
  add(rb,new THREE.CylinderGeometry(.004,.004,len,3),'#eee4c6',[0,0,id==='old_bow'?-.224:-.15],{plain:true});
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

/** Left hand: a shield on the forearm, a quiver on the back for a bow. Light weapons use buildWeapon. */
export function buildOffhand(rb,kind,id) {
 if(kind==='shield'){
  rb.bone('offhand','handL',[0,.06,0]);
  const look={crab_shield:['#d4704c','#f4c79a',.24],beetle_buckler:['#5f8a5a','#d9c27b',.2],crag_tower_shield:['#7c8d90','#e8b867',.26]}[id]||['#8a6748','#d9c27b',.22];
  const [face,trim,r]=look, tall=id==='crag_tower_shield'?1.6:1, sides=id==='crag_tower_shield'?6:14;
  // Strapped to the forearm, face turned forward and a little outward so the top-down camera reads it.
  const o={rot:[0,.55,0]};
  rb.add('offhand',new THREE.CylinderGeometry(r,r*.94,.045,sides).rotateX(Math.PI/2).scale(1,tall,1),face,{...o,pos:[.05,0,.07]});
  rb.add('offhand',new THREE.TorusGeometry(r*.97,.018,5,sides).scale(1,tall,1),trim,{...o,pos:[.06,0,.095]});
  rb.add('offhand',new THREE.SphereGeometry(r*.24,8,6),trim,{...o,pos:[.07,0,.11]});
 } else if(kind==='quiver'){
  rb.add('chest',new THREE.CylinderGeometry(.07,.06,.5,8),'#7a5434',{pos:[-.13,.02,-.19],rot:[.2,0,.45]});
  rb.add('chest',new THREE.TorusGeometry(.07,.012,4,10).rotateX(Math.PI/2),'#c9a46a',{pos:[-.03,.24,-.24],rot:[.2,0,.45],plain:true});
  for(const [dx,dz] of [[0,0],[.03,.02],[-.03,.015]])rb.add('chest',new THREE.ConeGeometry(.022,.08,4),'#efe6cf',{pos:[-.02+dx,.3,-.25+dz],rot:[.2,0,.45],plain:true});
 }
}

/** Gloves: a cuff and back-of-hand plate on both hands, coloured by look. */
export function buildGloves(rb,look) {
 if(!look)return;
 const [c,trim]={hide:['#a8764a','#e4c491'],shell:['#d48a62','#e9d3b0'],pelt:['#7d8a96','#c9b48c'],wrap:['#e6e0cf','#9fb7c9'],plate:['#8b9896','#c9c5af']}[look]||['#a8764a','#e4c491'];
 for(const h of ['handL','handR']){
  rb.add(h,new THREE.CylinderGeometry(.05,.044,.06,8),c,{pos:[0,.03,0]});
  rb.add(h,new THREE.TorusGeometry(.05,.01,4,10).rotateX(Math.PI/2),trim,{pos:[0,.06,0],plain:true});
 }
}
