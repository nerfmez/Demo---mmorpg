// One approved exterior style slice. Parts are merged by colour per building/prop
// group at construction time; no new textures, frame callbacks or gameplay rules.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlined, darker } from './toon.js';
import { toBoxLocal } from '../core/math.js';

const C = { plaster:'#e4dcc5', stone:'#a9aa98', wood:'#80644c', dark:'#554f43', glass:'#6f9699', rope:'#c0ae7f', leaf:'#74875c', fish:'#adc1ba' };
function builder() {
  const batches=new Map(), root=new THREE.Group();
  const part=(geo,color,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));
    geo.applyMatrix4(matrix); geo.deleteAttribute('uv'); const flat=geo.index?geo.toNonIndexed():geo;
    if(flat!==geo)geo.dispose();
    if(!batches.has(color))batches.set(color,[]);batches.get(color).push(flat);
  };
  const box=(w,h,d,color,x,y,z,rx=0,ry=0,rz=0)=>part(new THREE.BoxGeometry(w,h,d),color,x,y,z,rx,ry,rz);
  const finish=()=>{
    for(const [color,geos] of batches){const geo=mergeGeometries(geos);geos.forEach(g=>g.dispose());root.add(outlined(geo,toon(color),{outline:darker(color,.56),width:.018}));}
    return root;
  };
  return {part,box,finish};
}

function roofGeometry(w,d,rise,hip) {
  const shape=new THREE.Shape();shape.moveTo(-d/2,0);shape.lineTo(0,rise);shape.lineTo(d/2,0);shape.closePath();
  if(!hip){const g=new THREE.ExtrudeGeometry(shape,{depth:w,bevelEnabled:false});g.translate(0,0,-w/2);g.rotateY(Math.PI/2);return g;}
  const vertices=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2],[-w/2+d*.32,rise,0],[w/2-d*.32,rise,0]];
  const faces=[0,4,5,0,5,1,1,5,2,2,5,4,2,4,3,3,4,0];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(i=>vertices[i]),3));g.computeVertexNormals();return g;
}

export function marketBuilding(bx,y) {
  const b=builder(),{box,part}=b,w=bx.hx*2,d=bx.hz*2;
  const two=bx.variant==='inn',hip=bx.variant==='fish_hall';
  const rise=two?1.5:1.15,wall=bx.height-rise,roof=bx.roofColor;
  // A recessed doorstep removes the continuous high curb across the door.
  box(w,.26,d-.55,C.stone,0,.13,-.275);
  for(const side of [-1,1])box(w/2-.78,.26,.55,C.stone,side*(w/4+.39),.13,d/2-.275);
  box(1.56,.08,.52,C.stone,0,.04,d/2-.26);
  box(1.48,.16,.27,'#b7b4a3',0,.08,d/2-.395);
  box(w-.6,wall-.24,d-.6,bx.wallColor || C.plaster,0,(wall+.24)/2,0);
  // Low timber frame and uneven stone footing, contained by the collider.
  for(const x of [-w/2+.26,w/2-.26])for(const z of [-d/2+.26,d/2-.26])box(.16,wall,.16,C.wood,x,wall/2,z);
  box(w-.04,.16,d-.04,C.wood,0,wall-.08,0);
  if(two)box(w-.06,.15,d-.06,C.wood,0,2.4,0);
  for(let x=-w/2+.45;x<w/2-.45;x+=1.2)box(.9,.14,.04,x%2>.5?'#b2b19e':C.stone,x,.13,d/2-.025);
  part(roofGeometry(w,d,rise,hip),roof,0,wall,0);
  // Broad tile courses; small staggered joints read as terracotta/slate at play zoom.
  const courses=hip?4:5;
  for(const side of [-1,1])for(let i=1;i<courses;i++){
    const t=i/courses,z=side*d/2*(1-t),length=hip?w-d*.64*t:w;
    box(length,.035,.055,i%2?darker(roof,.91):roof,0,wall+rise*t+.02,z,side*Math.atan2(rise,d/2));
    for(let x=-length/2+.5;x<length/2-.3;x+=1.45)box(.028,.035,d/(courses*2)*.75,darker(roof,.84),x+(i%2)*.3,wall+rise*(t-.07)+.025,z+side*d*.035,side*Math.atan2(rise,d/2));
  }
  box(hip?w-d*.64:w,.11,.18,darker(roof,.85),0,wall+rise+.045,0);
  const z=d/2-.08;
  // Doors, shutters and lintels all remain inside the base footprint.
  box(1.05,1.9,.06,C.dark,0,1.12,z);
  for(const x of [-.62,.62])box(.12,2,.10,C.wood,x,1.2,z);
  box(1.35,.13,.1,C.wood,0,2.2,z);
  box(.065,.065,.07,C.rope,.32,1.13,z+.035);
  const windows=hip?[-w*.33,-w*.17,w*.17,w*.33]:bx.variant==='provisioner'?[-w*.31,w*.31]:[-w*.29,w*.29];
  for(const height of two?[1.65,3.5]:[1.65])for(const x of windows){
    box(.83,.88,.045,C.dark,x,height,z);box(.68,.72,.06,C.glass,x,height,z+.008);
    box(.065,.77,.08,C.wood,x,height,z+.04);box(.73,.06,.08,C.wood,x,height,z+.04);
    for(const s of [-1,1])box(.22,.88,.055,two?'#71847a':C.wood,x+s*.53,height,z-.01,0,s*.15);
    box(1.27,.1,.16,C.wood,x,height-.49,z-.02);
  }
  if(hip) {
    // The hall's fish trays make its working frontage distinct from cottages.
    for(const x of [-w*.25,w*.25]) {
      box(2.0,.12,.38,C.wood,x,.74,z-.14);
      box(1.62,.07,.28,C.dark,x,.83,z-.14);
      for(let i=0;i<4;i++)part(new THREE.SphereGeometry(.13,8,5).scale(1.5,.38,.55),C.fish,x-.57+i*.38,.89,z-.14);
    }
  }
  if(bx.variant==='workshop') {
    for(const x of [-w*.29,w*.29])for(let i=0;i<3;i++)box(w*.29,.13,.06,i%2?C.wood:'#8b7157',x,.53+i*.16,z-.05);
  }
  if(bx.variant==='provisioner') {
    // A low shopfront display occupies its foundation, not the walking lane.
    for(const x of [-w*.31,w*.31]) {
      box(1.7,.10,.40,C.wood,x,.87,z-.14);
      for(let i=0;i<3;i++)box(.30,.27,.28,i%2?'#b6a783':'#929e80',x-.48+i*.48,1.055,z-.14);
    }
  }
  if(two) {
    // Low shuttered inn windows and a modest timber sill, no grand balcony.
    box(w*.72,.12,.23,C.wood,0,2.86,z-.04);
    for(const x of [-w*.29,w*.29])box(1.27,.16,.18,'#74816b',x,3.01,z-.03);
  }
  // Side windows give the long fish hall a different rhythm from narrow shops.
  for(const x of [-w/2+.07,w/2-.07])for(const zz of [-d*.23,d*.23]){
    box(.055,.8,.9,C.wood,x,1.6,zz);box(.065,.62,.7,C.glass,x,1.6,zz);
  }
  if(bx.variant==='workshop'){
    box(1,.7,.8,'#a29887',w*.3,wall+rise-.05,-d*.18);
    box(1.15,.14,.93,C.stone,w*.3,wall+rise+.33,-d*.18);
  }
  // A shallow fabric door canopy and painted trade sign.
  box(2.25,.08,.68,two?'#71847a':'#bca67c',0,2.45,z-.33,.12);
  box(1.2,.65,.08,C.wood,w*.33,2.52,z-.01);
  if(hip){part(new THREE.SphereGeometry(.23,8,5).scale(1.5,.57,.14),C.fish,w*.33,2.52,z+.045);part(new THREE.ConeGeometry(.15,.24,3).scale(1,1,.1),C.fish,w*.33+.32,2.52,z+.045,0,0,Math.PI/2);}
  else if(bx.variant==='workshop'){box(.4,.15,.04,C.stone,w*.33,2.68,z+.045);box(.07,.3,.04,C.rope,w*.33,2.48,z+.05);}
  else if(two) {
    box(.68,.10,.035,C.rope,w*.33,2.49,z+.045);
    for(const x of [-.29,.29])box(.055,.27,.035,C.rope,w*.33+x,2.48,z+.045);
    box(.18,.12,.035,C.rope,w*.33-.17,2.60,z+.045);
  } else {box(.38,.25,.04,C.rope,w*.33,2.48,z+.045);part(new THREE.ConeGeometry(.25,.29,3).scale(1,1,.1),C.rope,w*.33,2.68,z+.045);}
  // Quiet greenery at building corners, inside the solid footprint.
  for(const x of [-w/2+.6,w/2-.6]){
    part(new THREE.CylinderGeometry(.3,.23,.45,8),'#a87559',x,.46,z-.42);
    part(new THREE.DodecahedronGeometry(.38,0),C.leaf,x,.85,z-.42);
  }
  const root=b.finish();root.position.set(bx.x,y,bx.z);root.rotation.y=bx.angle;return root;
}

export function marketStall(bx,color,y,fish) {
  const b=builder(),{box,part}=b,w=bx.hx*2,d=bx.hz*2;
  box(w,.14,d-.12,C.wood,0,.95,0);box(w-.05,.86,.1,'#9b7954',0,.48,d/2-.12);
  for(const x of [-bx.hx+.12,bx.hx-.12])for(const z of [-bx.hz+.12,bx.hz-.12])box(.12,2.4,.12,C.wood,x,1.2,z);
  // Curved sag in the fabric replaces the flat rectangular awning silhouette.
  const pos=[],idx=[];const steps=10;
  for(let j=0;j<=steps;j++)for(const x of [-bx.hx+.02,bx.hx-.02]){
    const t=j/steps;pos.push(x,2.45-Math.sin(t*Math.PI)*.14-t*.09,-bx.hz+.02+t*(d-.04));
  }
  for(let j=0;j<steps;j++){const k=j*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
  const fabric=new THREE.BufferGeometry();fabric.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));fabric.setIndex(idx);fabric.computeVertexNormals();
  // Double faces are explicit so the shared toon material stays opaque and single-sided.
  const back=fabric.clone();back.setIndex(idx.flatMap((_,i)=>i%3===0?[idx[i],idx[i+2],idx[i+1]]:[]));back.computeVertexNormals();
  part(fabric,color);part(back,color);
  for(let i=0;i<6;i++){const x=-bx.hx+.28+i*(w-.56)/5;part(new THREE.SphereGeometry(.18,7,4).scale(1,.42,.33),color,x,2.34,bx.hz-.06);}
  for(const x of [-.75,.75]){
    box(1.2,.11,1.15,C.dark,x,1.06,0);
    for(const z of [-.53,.53])box(1.2,.15,.055,C.wood,x,1.14,z);
    for(let i=0;i<4;i++){
      if(fish){part(new THREE.SphereGeometry(.19,8,5).scale(.68,.35,1.7),i%2?C.fish:'#879ea0',x-.39+i*.26,1.17,0,0,(i%2-.5)*.15);part(new THREE.ConeGeometry(.1,.17,3),C.fish,x-.39+i*.26,1.17,-.37,Math.PI/2);}
      else {box(.18,.14,.42,i%2?'#b6a783':'#8b9d86',x-.38+i*.25,1.18,0);}
    }
  }
  // Back-rail goods and under-table storage make each stall a working counter.
  box(w-.25,.08,.08,C.wood,0,1.95,-bx.hz+.14);
  for(const x of [-.95,0,.95]){
    if(fish){
      part(new THREE.CylinderGeometry(.012,.012,.22,5),C.rope,x,1.82,-bx.hz+.15);
      part(new THREE.SphereGeometry(.16,8,5).scale(.58,1.5,.45),C.fish,x,1.58,-bx.hz+.15);
    } else {
      part(new THREE.CylinderGeometry(.22,.19,.35,8),'#b5a27b',x,.25,.05);
      for(let i=0;i<3;i++)part(new THREE.SphereGeometry(.09,7,5),'#ba8052',x+(i-1)*.10,.46,.05);
    }
  }
  const root=b.finish();root.position.set(bx.x,y,bx.z);root.rotation.y=bx.angle;return root;
}

export function marketDockCargo(cargo,y) {
  const b=builder(),{box,part}=b,w=cargo.hx*2,d=cargo.hz*2;
  if(cargo.kind==='fish_crates'){
    for(const z of [-d*.25,d*.25])for(const level of [0,1]){
      const cy=.17+level*.34;
      box(w-.04,.055,d*.44,C.wood,0,cy-.13,z);
      for(const x of [-w/2+.06,w/2-.06])box(.07,.29,d*.44,'#aa8055',x,cy,z);
      for(const zz of [-d*.22,d*.22]){
        box(w-.05,.09,.045,'#b18b5e',0,cy-.08,z+zz);
        box(w-.05,.09,.045,'#b18b5e',0,cy+.08,z+zz);
      }
      if(level)for(const x of [-.18,.08])part(new THREE.SphereGeometry(.11,8,5).scale(.6,.4,1.7),C.fish,x,.69,z);
    }
  } else if(cargo.kind==='barrels'){
    for(const z of [-d*.25,d*.25]){
      part(new THREE.CylinderGeometry(.29,.28,cargo.height-.04,10),'#9b7953',0,cargo.height/2,z);
      for(const yy of [.18,cargo.height-.18])part(new THREE.TorusGeometry(.293,.025,5,12),'#697671',0,yy,z,Math.PI/2);
      part(new THREE.CylinderGeometry(.26,.26,.045,10),C.wood,0,cargo.height-.03,z);
    }
  } else if(cargo.kind==='net_rack'){
    for(const z of [-d/2+.08,d/2-.08])box(.09,cargo.height,.09,C.wood,0,cargo.height/2,z);
    box(.09,.10,d,C.wood,0,cargo.height-.05,0);
    for(let z=-d/2+.15;z<d/2-.10;z+=.18)box(.025,1.1,.025,'#7d8b78',.06,.84,z);
    for(let yy=.3;yy<1.4;yy+=.18)box(.025,.025,d-.22,'#7d8b78',.06,yy,0);
    for(const z of [-.65,0,.65])part(new THREE.SphereGeometry(.12,8,5),'#bb9463',.07,1.34,z);
    part(new THREE.DodecahedronGeometry(.3,0).scale(1,.5,1.4),'#84927c',-.04,.15,0);
  }
  const root=b.finish();root.position.set(cargo.x,y,cargo.z);root.rotation.y=cargo.angle;return root;
}

export function marketQuay(world) {
  const b=builder(),{box,part}=b,range=world.data.town.styleSlice.quayRange,cargoGroups=[];
  const shore=world.data.sea.shore;
  // The low coping follows the same curve as water/collision; no separate coast.
  for(let i=1;i<shore.length;i++){
    const a=shore[i-1],c=shore[i];if(a[0]<range[0]||c[0]>range[1])continue;
    let spans=[[0,1]];
    // Clip only the portion occupied by a pier, rather than dropping a full
    // shoreline segment and leaving an oversized notch at each approach.
    for(const d of world.docks.filter(d=>d.kind==='pier')){
      const start=toBoxLocal(d,...a),end=toBoxLocal(d,...c);
      let lo=0,hi=1;
      for(const [p,q,half] of [[start.lx,end.lx,d.hx+.06],[start.lz,end.lz,d.hz+.06]]){
        const delta=q-p;
        if(Math.abs(delta)<1e-8){if(Math.abs(p)>half){hi=-1;break;}continue;}
        const u=(-half-p)/delta,v=(half-p)/delta;
        lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
      }
      if(lo>=hi)continue;
      spans=spans.flatMap(([u,v])=>hi<=u||lo>=v?[[u,v]]:[[u,Math.min(v,lo)],[Math.max(u,hi),v]].filter(([p,q])=>q-p>1e-5));
    }
    for(const [u,v] of spans){
      const ax=a[0]+(c[0]-a[0])*u,az=a[1]+(c[1]-a[1])*u;
      const cx=a[0]+(c[0]-a[0])*v,cz=a[1]+(c[1]-a[1])*v;
      const len=Math.hypot(cx-ax,cz-az),angle=Math.atan2(cz-az,cx-ax),x=(ax+cx)/2,z=(az+cz)/2;
      const bottom=world.waterLevel-.45,top=.65;
      box(len+.02,top-bottom,.45,C.stone,x,(top+bottom)/2,z,0,-angle);
      box(len+.015,.12,.62,'#bbb7a2',x,.67,z,0,-angle);
      box(len*.8,.045,.04,'#939788',x,world.waterLevel+.15,z+.235,0,-angle);
    }
  }
  // Rope coils and hanging nets sit on the outer edges of the two market piers.
  for(const d of world.docks.filter(d=>d.id==='market_west'||d.id==='market_east')){
    const x=d.x+d.hx-.45,z=d.z+2,y=d.height;
    for(let i=0;i<3;i++)part(new THREE.TorusGeometry(.35-i*.08,.035,5,16),C.rope,x,y+.05,z,Math.PI/2);
    for(let i=0;i<7;i++)box(.023,.78,.023,'#8f9b82',d.x-d.hx+.2,y-.25,d.z-1+i*.28);
    for(let i=0;i<4;i++)box(.023,.025,1.7,'#8f9b82',d.x-d.hx+.2,y-.56+i*.23,d.z-.15);
    for(let i=0;i<3;i++)part(new THREE.SphereGeometry(.12,8,5),'#b9905f',d.x-d.hx+.2,y+.10,d.z-.8+i*.6);
  }
  for(const cargo of world.data.harbor.dockCargo || []) {
    cargoGroups.push(marketDockCargo(cargo,world.groundY(cargo.x,cargo.z)));
  }
  for(const index of world.data.town.styleSlice.boatIndices || []) {
    const [x,z,angle]=world.data.harbor.boats[index];
    const berth=world.docks.filter(d=>d.kind==='pier'&&!d.rampFromTerrain).sort((a,c)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(c.x-x,c.z-z))[0];
    if(!berth)continue;
    const side=berth.x<x?-1:1;
    for(const zz of [-1.8,1.8]) {
      const sx=x+Math.cos(angle)*side*1.05+Math.sin(angle)*zz;
      const sz=z-Math.sin(angle)*side*1.05+Math.cos(angle)*zz;
      const ex=berth.x-side*(berth.hx-.12),ez=sz;
      const start=new THREE.Vector3(sx,world.waterLevel+.69,sz),end=new THREE.Vector3(ex,berth.height+.12,ez);
      const middle=start.clone().lerp(end,.5);middle.y-=.15;
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start,middle,end]),8,.025,5,false),C.rope);
      part(new THREE.CylinderGeometry(.055,.08,.22,6),C.wood,ex,berth.height+.11,ez);
    }
  }
  const root=b.finish();root.add(...cargoGroups);return root;
}

/** Open working boat for the two reviewed market berths; no sailing logic. */
export function marketFishingBoat(x,z,angle,water) {
  const b=builder(),{box,part}=b;
  // Port/starboard sides taper into a pointed bow and a flat, low stern.
  const rim=[[-.78,-3.2],[-1.08,-2],[-1.16,0],[-.94,2.3],[-.44,3.35],[0,3.8],[.44,3.35],[.94,2.3],[1.16,0],[1.08,-2],[.78,-3.2]];
  for(let i=0;i<rim.length;i++){
    const a=rim[i],c=rim[(i+1)%rim.length];
    const bottom=p=>[p[0]*.62,-.36,p[1]*.88];
    const vertices=[[a[0],.50,a[1]],[c[0],.50,c[1]],bottom(a),bottom(c)];
    const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute([0,2,1,1,2,3,0,1,2,1,3,2].flatMap(k=>vertices[k]),3));face.computeVertexNormals();
    part(face,i%3?'#8f6948':'#987550');
    const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
    box(.12,.12,len+.045,C.wood,(a[0]+c[0])/2,.52,(a[1]+c[1])/2,0,Math.atan2(dx,dz));
  }
  const floor=new THREE.BufferGeometry();
  const floorVertices=[];
  for(let i=0;i<rim.length;i++){
    const a=rim[i],c=rim[(i+1)%rim.length];
    floorVertices.push(0,.10,0,a[0]*.84,.10,a[1]*.945,c[0]*.84,.10,c[1]*.945);
  }
  floor.setAttribute('position',new THREE.Float32BufferAttribute(floorVertices,3));floor.computeVertexNormals();
  part(floor,'#aa8961');
  for(const zz of [-1.65,.65])box(1.82,.16,.48,C.wood,0,.30,zz);
  // Short mast and a furled sail keep the open work deck legible.
  part(new THREE.CylinderGeometry(.055,.085,3.65,7),C.wood,0,1.62,.15);
  part(new THREE.CylinderGeometry(.13,.13,1.9,7),'#d7cbb0',.10,2.22,.15,0,0,.025);
  box(1.75,.075,.075,C.wood,.15,2.50,.15,0,0,-.15);
  box(.09,.12,2.7,C.wood,-.25,.65,-.72,.03,-.10);
  box(.27,.10,.82,C.wood,-.39,.64,-2.11,.03,-.10);
  // A fish box and net bundle are grouped in the stern working area.
  box(.72,.28,.72,C.dark,.20,.24,-2.35);
  for(let i=0;i<3;i++)part(new THREE.SphereGeometry(.12,8,5).scale(.58,.4,1.7),C.fish,-.03+i*.23,.43,-2.35);
  part(new THREE.DodecahedronGeometry(.41,0).scale(1,.45,1.2),'#89947a',-.43,.26,1.8);
  for(let i=0;i<3;i++)part(new THREE.TorusGeometry(.24-i*.06,.028,5,14),C.rope,.48,.14,1.75,Math.PI/2);
  const root=b.finish();root.position.set(x,water+.15,z);root.rotation.y=angle;return root;
}
