// Authored port exteriors. All local geometry stays inside its data footprint.
// Static colour batches reuse the market's cel materials and normal lifecycle.
import * as THREE from 'three';
import { builder, shopDoor, shopWindow, shopRoof, shopLantern } from './market.js';
import { fromBoxLocal } from '../core/math.js';
const C={wood:'#80644c',plank:'#a48660',dark:'#554f43',stone:'#a9aa98',rope:'#c0ae7f',leaf:'#74875c',metal:'#78857f'};
function pot(b,x,z){
  b.part(new THREE.CylinderGeometry(.28,.21,.40,8),'#b58061',x,.30,z);
  b.part(new THREE.DodecahedronGeometry(.34,0),C.leaf,x,.65,z);
}
function crate(b,x,y,z,w=.75,d=.75,h=.70){
  b.box(w,h,d,C.plank,x,y+h/2,z);
  for(const dx of [-w*.38,w*.38])b.box(.07,h+.02,.045,C.wood,x+dx,y+h/2,z+d/2+.025);
  for(const yy of [.12,h-.12])b.box(w,.07,d+.02,C.wood,x,y+yy,z);
  b.box(.07,h*.93,.055,C.wood,x,y+h/2,z+d/2+.045,0,0,.55);
}
function barrel(b,x,z,y=0){
  b.part(new THREE.CylinderGeometry(.30,.28,.78,10),'#9b7953',x,y+.39,z);
  for(const yy of [.15,.63])b.part(new THREE.TorusGeometry(.30,.025,5,12),C.metal,x,y+yy,z,Math.PI/2);
  b.part(new THREE.CylinderGeometry(.27,.27,.04,10),C.wood,x,y+.78,z);
}
function cottage(b,bx){
  const {box}=b,w=bx.hx*2,d=bx.hz*2,two=bx.variant==='timber_home';
  const rise=two?1.27:1.05,wall=bx.height-rise-.13,front=bx.hz-1.15,back=-bx.hz+.22;
  box(w,.12,d,C.stone,0,.06,0);
  box(w-.5,wall-.12,front-back,bx.wallColor,0,(wall+.12)/2,(front+back)/2);
  for(const x of [-bx.hx+.28,bx.hx-.28])box(.14,wall,.14,C.wood,x,wall/2,front);
  box(w-.42,.13,.13,C.wood,0,wall-.06,front+.025);
  shopRoof(b,w,d-.9,wall,rise,-.45,bx.roofColor,{hip:bx.variant==='netters_home',frontGable:bx.variant==='front_gable'||two});
  const doorX=bx.entryX||0;
  shopDoor(b,doorX,front+.10,1.82);
  const windowX=Math.min(2.55,bx.hx-.95);
  for(const x of [-windowX,windowX])shopWindow(b,x,1.40,front+.08,.80,.83,two?'#708c80':C.wood);
  if(two){
    box(w-.42,.15,.15,C.wood,0,2.42,front+.05);
    for(const x of [-windowX,0,windowX])shopWindow(b,x,3.45,front+.10,.86,.98,'#708c80');
    for(const side of [-1,1])box(.10,1.22,.10,C.wood,side*1.45,3.48,front+.06,0,0,side*.50);
    box(.72,.54,.72,C.stone,2.25,bx.height-.75,-1.55);
  } else if(bx.variant==='netters_home'){
    box(2.2,.08,.10,C.wood,-1.6,1.95,front+.24);
    for(let x=-2.6;x<-.7;x+=.22)box(.018,1.0,.018,'#84947f',x,1.37,front+.25);
    for(let y=.91;y<1.85;y+=.2)box(1.9,.018,.018,'#84947f',-1.65,y,front+.25);
    for(const x of [-2.4,-1.6,-.8])b.part(new THREE.SphereGeometry(.10,7,5),C.rope,x,1.85,front+.25);
    barrel(b,-Math.min(2.85,bx.hx-.40),bx.hz-.43);
  } else {
    box(2.30,.075,.68,two?C.wood:'#9caa8d',doorX,2.06,front+.48,.10);
    const planterX=Math.min(2.45,bx.hx-.85);
    box(1.5,.25,.35,C.wood,planterX,.46,bx.hz-.36);
    for(const dx of [-.45,0,.45])b.part(new THREE.DodecahedronGeometry(.19,0),C.leaf,planterX+dx,.72,bx.hz-.35);
  }
  if(two){box(2.3,.08,.73,C.wood,0,2.20,front+.46,.08);shopLantern(b,-.95,1.55,front+.24);}
  pot(b,bx.hx-.47,bx.hz-.46);
  box(1.4,.055,.50,'#b8b49d',doorX,.028,bx.hz-.25);
}
function warehouse(b,bx){
  const {box}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-1.8,back=-bx.hz+.22,wall=3.68;
  box(w,.18,d,C.stone,0,.09,0);
  box(w-.5,wall-.18,front-back,bx.wallColor,0,(wall+.18)/2,(front+back)/2);
  const timber=bx.variant==='sail_store';
  for(const x of [-bx.hx+.28,bx.hx-.28])box(.18,wall,.18,C.wood,x,wall/2,front);
  box(w-.4,.17,.17,C.wood,0,wall-.08,front+.05);
  if(timber)for(let y=.4;y<3.4;y+=.43)box(w-.45,.10,.05,'#9d8362',0,y,front+.02);
  shopRoof(b,w,d-1.6,wall,1.17,-.8,bx.roofColor,{frontGable:bx.variant!=='fish_store',hip:bx.variant==='fish_store'});
  // High sliding loading doors and diagonal bracing, rather than cottage doors.
  box(4.10,2.9,.08,C.dark,0,1.62,front+.12);
  for(const side of [-1,1]){
    box(1.82,2.75,.10,timber?'#9f8767':'#8b9d91',side*.98,1.62,front+.19);
    for(const xx of [-.70,0,.70])box(.05,2.7,.03,C.wood,side*.98+xx,1.62,front+.255);
    box(.10,3.0,.04,C.wood,side*.98,1.62,front+.28,0,0,side*.52);
  }
  box(4.6,.14,.18,C.metal,0,3.16,front+.20);
  box(6.0,.09,.90,timber?'#b5a681':'#819b92',0,3.03,front+.61,.12);
  for(const x of [-2.85,2.85])box(.12,3.02,.12,C.wood,x,1.51,front+1.05);
  for(const side of [-1,1]){
    shopWindow(b,side*4.55,2.64,front+.10,.54,.64,'#788a7e');
    box(.08,.55,.08,C.wood,side*2.75,2.73,front+.83,0,0,side*.48);
  }
  if(timber){
    for(const x of [-4.65,-3.7])b.part(new THREE.CylinderGeometry(.25,.25,1.30,8),'#d7c8a5',x,.84,bx.hz-.76,Math.PI/2);
    crate(b,4.24,.18,bx.hz-.59,.95,.88,.68);
  } else {
    crate(b,-4.42,.18,bx.hz-.63,.90,.84,.70);
    crate(b,-4.42,.88,bx.hz-.63,.82,.78,.58);
    barrel(b,4.42,bx.hz-.51,.18);
  }
  box(1.25,.58,.11,C.wood,0,3.41,front+.21);
  // Painted cargo arrows stay legible without text/fonts.
  for(const x of [-.3,.3]){box(.06,.30,.03,'#e1d5b4',x,3.38,front+.29);b.part(new THREE.ConeGeometry(.11,.18,3).scale(1,1,.15),'#e1d5b4',x,3.60,front+.29);}
}
function repairShed(b,bx){
  const {box}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-1.8,wall=2.46;
  box(w,.12,d,C.stone,0,.06,0);
  box(w-.45,wall-.12,d-1.95,bx.wallColor,0,(wall+.12)/2,-.97);
  shopRoof(b,w,d-1.6,wall,1.18,-.80,bx.roofColor,{frontGable:true});
  box(5.35,1.95,.10,C.dark,.3,1.15,front+.12);
  for(const x of [-2.5,3.1])box(.15,2.1,.18,C.wood,x,1.2,front+.23);
  box(6.0,.14,.18,C.wood,.3,2.25,front+.24);
  shopDoor(b,-3.75,front+.12,1.88);
  box(6.1,.075,.78,'#718d90',.4,2.22,front+.63,.10);
  for(const x of [-2.5,3.3])box(.12,2.21,.12,C.wood,x,1.1,front+1.03);
  box(2.55,.13,.95,C.plank,-.9,.85,bx.hz-.61);
  for(const x of [-1.95,.15])box(.12,.78,.70,C.wood,x,.40,bx.hz-.61);
  box(1.3,.07,.36,'#a7aaa0',-.95,.99,bx.hz-.62,0,0,.05);
  box(.25,.14,.43,C.wood,-1.64,.99,bx.hz-.61);
  for(let z=-1.6;z<.9;z+=.65)box(1.6,.12,.28,C.plank,3.25,.33,z);
  for(const x of [-1.65,-.60,.45,1.5]){
    box(.06,.66,.07,C.rope,x,1.43,front+.21);
    box(.38,.16,.10,C.metal,x,1.82,front+.23,0,0,.2);
  }
  barrel(b,4.28,bx.hz-.46);
  shopLantern(b,-4.35,1.69,front+.23);
  box(1.25,.54,.08,'#718d90',.3,2.64,front+.18);
  box(.85,.13,.035,'#dfd4b2',.3,2.56,front+.235);
  box(.065,.40,.035,'#dfd4b2',.3,2.77,front+.235);
}
export function districtBuilding(bx,y){
  const b=builder();
  if(bx.kind==='warehouse')warehouse(b,bx);
  else if(bx.kind==='shipyard')repairShed(b,bx);
  else cottage(b,bx);
  const root=b.finish();root.position.set(bx.x,y,bx.z);root.rotation.y=bx.angle;return root;
}
export function harborWorkProp(p,y){
  const b=builder(),{box,part}=b;
  if(p.kind==='cargo_stack'){
    crate(b,-.59,0,-.15,1.0,1.05,.72);crate(b,.58,0,.16,1.0,1.12,.72);crate(b,.58,.72,.16,.90,1.0,.65);
    for(const xx of [-1.05,-.12,.80])box(.08,.09,1.78,C.wood,xx,.045,0);
  } else if(p.kind==='handcart'){
    box(1.2,.12,1.45,C.plank,0,.55,-.17);
    for(const x of [-.55,.55]){box(.10,.45,1.45,C.wood,x,.81,-.17);box(.07,.07,.8,C.wood,x,1.01,.84,-.14);}
    box(1.12,.43,.10,C.wood,0,.80,-.87);
    box(1.35,.08,.08,C.metal,0,.34,-.20);
    for(const x of [-.66,.66]){part(new THREE.CylinderGeometry(.28,.28,.09,10),C.wood,x,.30,-.20,0,0,Math.PI/2);part(new THREE.TorusGeometry(.25,.024,5,12),C.metal,x,.30,-.20,0,Math.PI/2);}
    crate(b,0,.63,-.18,.74,.69,.48);
  } else if(p.kind==='timber_stack'){
    for(let yy=0;yy<3;yy++)for(const xx of [-.65,0,.65])box(.42,.18,p.hz*2-.10,yy%2?C.plank:'#b09873',xx,.16+yy*.19,0);
    for(const z of [-1.5,1.5])box(1.82,.09,.14,C.wood,0,.07,z);
  } else if(p.kind==='repair_bench'){
    box(1.95,.15,1.05,C.plank,0,.87,0);
    for(const x of [-.79,.79])for(const z of [-.39,.39])box(.13,.80,.13,C.wood,x,.40,z);
    box(1.20,.08,.24,C.metal,0,1.01,.02,0,.2);
    box(.23,.15,.28,C.wood,-.70,1.03,.15);
    box(.10,.08,.65,C.wood,.65,1.01,-.1,0,-.2);
  } else if(p.kind==='repair_hull'){
    const hz=p.hz-.18,hx=p.hx-.18;
    // Keel, low unfinished side planks and exposed ribs on timber trestles.
    box(.18,.15,hz*1.95,C.wood,0,.53,0);
    for(const z of [-hz*.62,hz*.62]){
      box(p.hx*1.8,.14,.23,C.wood,0,.35,z);
      for(const x of [-p.hx*.72,p.hx*.72])box(.18,.32,.28,C.wood,x,.16,z);
    }
    const ribPoints=[];
    for(let i=0;i<7;i++){
      const z=-hz+i*hz*2/6,taper=.30+.70*Math.sin((i/6)*Math.PI);
      const points=[[-hx*taper,1.45,z],[-hx*.70*taper,.76,z],[0,.57,z],[hx*.70*taper,.76,z],[hx*taper,1.45,z]].map(v=>new THREE.Vector3(...v));
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.055,5,false),'#c5a579');
      ribPoints.push({x:hx*taper,z});
    }
    for(const side of [-1,1]){
      const points=ribPoints.map(p=>new THREE.Vector3(side*p.x,1.48,p.z));
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.065,5,false),C.wood);
      const lower=ribPoints.map(p=>new THREE.Vector3(side*p.x*.78,.82,p.z));
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lower),18,.08,5,false),C.plank);
    }
  }
  const root=b.finish();root.position.set(p.x,y,p.z);root.rotation.y=p.angle;return root;
}
export function coastalLighthouse(world){
  const b=builder(),{box,part}=b,h=world.data.harbor,[x,z]=h.lighthouse;
  part(new THREE.CylinderGeometry(1.14,1.75,8.2,12),'#ede1c1',0,4.1,0);
  part(new THREE.CylinderGeometry(1.36,1.43,1.05,12),h.lighthouseStyle.stripeColor,0,5.27,0);
  part(new THREE.CylinderGeometry(1.64,1.66,.21,12),C.stone,0,8.23,0);
  part(new THREE.CylinderGeometry(.94,.94,1.45,8),'#e9c779',0,9.06,0);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,s=Math.sin(a),c=Math.cos(a);
    box(.09,1.54,.09,C.metal,s*.97,9.07,c*.97);
    box(.055,.55,.055,C.metal,s*1.49,8.62,c*1.49);
    const na=a+Math.PI/4,nx=Math.sin(na)*1.49,nz=Math.cos(na)*1.49;
    part(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(s*1.49,8.89,c*1.49),new THREE.Vector3(nx,8.89,nz)),1,.033,5,false),C.metal);
  }
  part(new THREE.ConeGeometry(1.39,1.12,8),h.lighthouseStyle.roofColor,0,10.30,0);
  shopDoor(b,0,1.73,1.80);
  box(1.18,.07,.23,C.stone,0,.035,1.77);
  for(const yy of [3.15,6.77]){box(.54,.71,.04,C.wood,0,yy,yy>5?1.23:1.50);box(.36,.54,.06,'#70959a',0,yy,yy>5?1.24:1.51);}
  const root=b.finish();root.position.set(x,world.groundY(x,z),z);return root;
}
export function districtScenery(world){
  const root=new THREE.Group();
  for(const p of world.data.harbor.workProps||[])root.add(harborWorkProp(p,world.groundY(p.x,p.z)));
  const b=builder();
  for(const d of world.docks.filter(d=>d.kind==='breakwater')){
    // Low armour stones only on the water side, outside the walking deck.
    for(const side of [-1,1])for(let z=-d.hz+.6;z<d.hz;z+=1.1){
      const p=fromBoxLocal(d,side*(d.hx+.58),z);
      if(!world.inSea(p.x,p.z))continue;
      const size=.43+(Math.sin(z*3.1)+1)*.045;
      b.part(new THREE.DodecahedronGeometry(size,0).scale(1,.78,1.15),'#a0a795',p.x,world.waterLevel+.17,p.z,0,z*.2);
    }
  }
  const armour=b.finish();armour.userData.waterContact=true;root.add(armour);return root;
}
