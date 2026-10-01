// One approved exterior style slice. Parts are merged by colour per building/prop
// group at construction time; no new textures, frame callbacks or gameplay rules.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlined, darker } from './toon.js';
import { outlineStructure } from './architecture.js';
import { toBoxLocal, fromBoxLocal, clamp } from '../core/math.js';
import { createRng } from '../core/rng.js';
import art from '../../data/art.json' with {type:'json'};

const handmade=art.architecture.handmade,roofArt=art.architecture.roof;
// A repeatable generator from a part's own numbers, so every rebuild of a model is identical.
export function seeded(...values) {
  let h=2166136261;
  for(const v of values)h=Math.imul(h^Math.round(v*997),16777619);
  return createRng(h>>>0);
}

const C = { plaster:'#e4dcc5', stone:'#a9aa98', wood:'#80644c', dark:'#554f43', glass:'#6f9699', rope:'#c0ae7f', leaf:'#74875c', fish:'#adc1ba' };
export function builder() {
  const batches=new Map(), root=new THREE.Group();
  const part=(geo,color,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));
    geo.applyMatrix4(matrix); geo.deleteAttribute('uv'); const flat=geo.index?geo.toNonIndexed():geo;
    if(flat!==geo)geo.dispose();
    if(!batches.has(color))batches.set(color,[]);batches.get(color).push(flat);
  };
  // Hand-built, not machined: small and medium timbers turn a little within their own plane
  // (about the thinnest axis, so nothing pushes into the wall behind it).
  const box=(w,h,d,color,x,y,z,rx=0,ry=0,rz=0)=>{
    const big=Math.max(w,h,d),amount=big<handmade.smallSize?handmade.smallTurn:big<handmade.mediumSize?handmade.mediumTurn:0;
    if(amount){
      const turn=(seeded(w,h,d,x,y,z).next()*2-1)*amount;
      if(d<=w&&d<=h)rz+=turn;else if(w<=h)rx+=turn;else ry+=turn;
    }
    part(new THREE.BoxGeometry(w,h,d),color,x,y,z,rx,ry,rz);
  };
  const finish=()=>{
    for(const [color,geos] of batches){const geo=mergeGeometries(geos);geos.forEach(g=>g.dispose());root.add(outlined(geo,toon(color),{outline:darker(color,.56),width:.018}));}
    return outlineStructure(root);
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

// Exterior shop assemblies occupy the original solid building plot, including
// the recessed work frontage. Services and interiors remain unchanged.
export function shopDoor(b,x,z,height=1.95) {
  const {box,part}=b;
  box(1.16,height,.10,C.dark,x,height/2+.13,z);
  for(const side of [-1,1])box(.12,height+.18,.16,C.wood,x+side*.65,height/2+.16,z);
  box(1.42,.14,.16,C.wood,x,height+.2,z);
  for(const dx of [-.36,0,.36])box(.035,height-.16,.025,'#7e6b50',x+dx,height/2+.13,z+.061);
  part(new THREE.SphereGeometry(.055,7,5),C.rope,x+.37,1.05,z+.07);
}
export function shopWindow(b,x,y,z,width=1.25,height=1.0,color=C.wood) {
  const {box}=b;
  box(width+.18,height+.16,.08,C.dark,x,y,z);
  box(width,height,.10,C.glass,x,y,z+.015);
  box(.08,height+.04,.13,C.wood,x,y,z+.04);
  box(width+.04,.07,.13,C.wood,x,y,z+.04);
  for(const side of [-1,1])box(.24,height+.16,.10,color,x+side*(width/2+.22),y,z);
  box(width+.7,.10,.28,C.wood,x,y-height/2-.12,z+.02);
}
// Roofs are laid in courses of tiles: each course is a row of plates of uneven length, staggered
// against the course below and alternating two shades, with a ragged lower edge; the ridge cap
// is laid in pieces. Plates stay inside the roof's own footprint and under the ridge.
export function shopRoof(b,w,d,base,rise,z,color,{hip=false,frontGable=false}={}) {
  const {part}=b,rng=seeded(w,d,base,rise,z);
  part(roofGeometry(frontGable?d:w,frontGable?w:d,rise,hip),color,0,base,z,0,frontGable?Math.PI/2:0);
  const half=frontGable?w/2:d/2,slope=Math.hypot(half,rise),angle=Math.atan2(rise,half);
  const courses=Math.max(3,Math.round(slope/roofArt.courseDepth)),tones=[darker(color,.90),darker(color,.96)];
  // along: run of the course; across: down the slope
  const plate=(along,across,tone,slopeAt,y,alongAt,tilt)=>frontGable
    ?part(new THREE.BoxGeometry(across,roofArt.tileThickness,along),tone,slopeAt,y,z+alongAt,0,0,-tilt)
    :part(new THREE.BoxGeometry(along,roofArt.tileThickness,across),tone,alongAt,y,z+slopeAt,tilt,0,0);
  for(const side of [-1,1])for(let i=0;i<courses;i++){
    const t=(i+.5)/courses,y=base+rise*t+roofArt.tileLift;
    // on a hip roof each course runs out to its lower edge and tucks under the hip caps
    const length=(hip?w-d*.64*i/courses:frontGable?d:w)-.04,depth=slope/courses*roofArt.courseOverlap;
    for(let at=-length/2+rng.range(0,.04),k=0;at<length/2-.08;k++){
      const run=Math.min(length/2-at,rng.range(...roofArt.plateLength));
      plate(run-.03,depth*rng.range(.84,1),tones[(i+k)%2],side*half*(1-t),y,at+run/2,side*angle+rng.range(-1,1)*roofArt.plateTilt);
      at+=run;
    }
  }
  if(hip){
    // the two hip ends get their own courses, then caps run down the four hip lines
    const run=d*.32,endSlope=Math.hypot(run,rise),endAngle=Math.atan2(rise,run),endCourses=Math.max(2,Math.round(endSlope/roofArt.courseDepth));
    for(const side of [-1,1])for(let i=0;i<endCourses;i++){
      const t=(i+.5)/endCourses,y=base+rise*t+roofArt.tileLift,length=d*(1-t)-.1,depth=endSlope/endCourses*roofArt.courseOverlap;
      for(let at=-length/2+rng.range(0,.04),k=0;at<length/2-.08;k++){
        const piece=Math.min(length/2-at,rng.range(...roofArt.plateLength));
        part(new THREE.BoxGeometry(depth*rng.range(.84,1),roofArt.tileThickness,piece-.03),tones[(i+k)%2],side*(w/2-run*t),y,z+at+piece/2,0,0,-side*(endAngle+rng.range(-1,1)*roofArt.plateTilt));
        at+=piece;
      }
    }
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const from=new THREE.Vector3(sx*(w/2-.1),base+.02,z+sz*(d/2-.1)),to=new THREE.Vector3(sx*(w/2-run),base+rise,z),dir=to.clone().sub(from);
      const cap=new THREE.BoxGeometry(.13,.11,dir.length()).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),dir.normalize()));
      part(cap,darker(color,.85),(from.x+to.x)/2,(from.y+to.y)/2+.06,(from.z+to.z)/2);
    }
  }
  const ridge=frontGable?d:hip?w-d*.64:w;
  for(let at=-ridge/2;at<ridge/2-.05;){
    const run=Math.min(ridge/2-at,rng.range(...roofArt.ridgeLength)),y=base+rise+.045-rng.range(0,.015);
    if(frontGable)part(new THREE.BoxGeometry(.15,.13,run-.02),darker(color,.85),0,y,z+at+run/2);
    else part(new THREE.BoxGeometry(run-.02,.13,.15),darker(color,.85),at+run/2,y,z);
    at+=run;
  }
}
function fishProp(b,x,y,z,vertical=false) {
  const {part,box}=b;
  part(new THREE.SphereGeometry(.16,9,5).scale(1.5,.48,.72),C.fish,x,y,z,0,vertical?0:.10,vertical?Math.PI/2:0);
  part(new THREE.ConeGeometry(.11,.18,3).scale(1,1,.4),C.fish,x+(vertical?0:-.29),y+(vertical?-.29:0),z,0,0,vertical?0:-Math.PI/2);
  // Dark eye and warm gill break the silhouette of an unmarked silver oval.
  box(.035,.035,.035,C.dark,x+(vertical?0:.13),y+(vertical?.13:.06),z+.11);
}
export function shopLantern(b,x,y,z) {
  const {box}=b;
  box(.13,.38,.14,C.wood,x,y+.3,z-.08);
  box(.30,.38,.30,'#e5c77f',x,y,z);
  box(.36,.07,.36,C.dark,x,y+.23,z);
  box(.32,.07,.32,C.dark,x,y-.23,z);
}
function shopShell(b,bx,front,wall,{timber=false,openBays=[]}={}) {
  const {box}=b,w=bx.hx*2,back=-bx.hz+.22;
  box(w-.40,wall-.14,front-back,bx.wallColor||C.plaster,0,(wall+.14)/2,(front+back)/2);
  for(const x of [-bx.hx+.27,bx.hx-.27])box(.16,wall,.16,C.wood,x,wall/2,front);
  box(w-.44,.16,.16,C.wood,0,wall-.08,front);
  if(timber)for(let y=.42;y<wall-.2;y+=.42)box(w-.5,.12,.05,'#987859',0,y,front+.04);
  // Shallow dark recesses are closed exterior displays, not new interior scenes.
  for(const [x,width] of openBays){
    box(width,1.68,.08,C.dark,x,1.05,front+.10);
    for(const dx of [-width/2,width/2])box(.13,1.9,.15,C.wood,x+dx,1.12,front+.15);
    box(width+.18,.14,.18,C.wood,x,1.99,front+.15);
  }
}
function fishHall(b,bx) {
  const {box,part}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-2.15,roofZ=-1.0;
  shopShell(b,bx,front,2.30,{openBays:[[-3.2,4.7],[3.2,4.7]]});
  shopRoof(b,w,d-2.0,2.3,1.25,roofZ,bx.roofColor,{hip:true});
  // A low open fish-market frontage, with two large work counters and a
  // short shade strip behind them so the fish remain visible from above.
  box(w-1.0,.08,.85,'#728e8c',0,2.14,front+.48,.13);
  for(const x of [-bx.hx+.7,0,bx.hx-.7])box(.12,2.18,.12,C.wood,x,1.09,front+.85);
  for(const x of [-3.2,3.2]){
    box(4.6,.13,1.15,'#a48358',x,.85,bx.hz-.72);
    for(const dx of [-1.9,1.9])box(.15,.79,.90,C.wood,x+dx,.40,bx.hz-.72);
    for(const dx of [-1.13,1.13]){
      box(2.08,.07,.93,'#668381',x+dx,.95,bx.hz-.72);
      for(const zz of [-.48,.48])box(2.15,.13,.05,'#b9ac8a',x+dx,1.03,bx.hz-.72+zz);
      for(const xx of [-.65,0,.65])fishProp(b,x+dx+xx,1.04,bx.hz-.68);
    }
    // Hanging catch is a secondary cue under the open market beam.
    for(const dx of [-.7,.7]){
      box(.018,.25,.018,C.rope,x+dx,1.83,front+.23);
      fishProp(b,x+dx,1.46,front+.23,true);
    }
  }
  shopDoor(b,0,front+.16,1.72);
  // Broad painted fish silhouette centred above the entrance.
  box(2.35,.70,.12,'#6e8984',0,2.40,front+.15);
  part(new THREE.SphereGeometry(.36,10,5).scale(1.8,.55,.13),'#e7dfbc',.13,2.41,front+.235);
  part(new THREE.ConeGeometry(.28,.38,3).scale(1,1,.16),'#e7dfbc',-.63,2.41,front+.235,0,0,-Math.PI/2);
  for(const x of [-bx.hx+.38,bx.hx-.38]){
    part(new THREE.CylinderGeometry(.27,.22,.60,8),'#b6a37c',x,.32,bx.hz-.48);
    for(let zz=-.3;zz<=.3;zz+=.15)box(.02,.9,.02,'#8c9d88',x,.72,front+.15+zz);
  }
}
function craftHouse(b,bx) {
  const {box,part}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-2.2,roofZ=-1.0;
  shopShell(b,bx,front,2.52,{timber:true,openBays:[[1.70,4.30]]});
  shopRoof(b,w-.08,d-2.0,2.52,1.20,roofZ,bx.roofColor,{frontGable:true});
  shopDoor(b,-2.60,front+.15);
  // The recessed front gable is timbered; the forge chimney breaks its roof.
  box(.14,1.05,.12,C.wood,0,3.04,front+.10);
  box(4.4,.12,.12,C.wood,0,2.75,front+.10);
  box(.72,2.80,.74,'#929187',3.42,2.05,-1.10);
  box(.94,.16,.92,C.stone,3.42,3.48,-1.10);
  // Open workbench and a recognisable horned anvil occupy the forecourt.
  box(3.10,.17,1.1,'#9e784d',.25,.93,bx.hz-.73);
  for(const x of [-1.03,1.53])box(.16,.87,.75,C.wood,x,.45,bx.hz-.73);
  box(.52,.32,.42,'#65716f',-.25,1.18,bx.hz-.73);
  box(.96,.12,.48,'#939b95',-.25,1.38,bx.hz-.73);
  part(new THREE.ConeGeometry(.22,.48,6),'#939b95',.40,1.38,bx.hz-.73,0,0,-Math.PI/2);
  box(.52,.13,.22,'#939b95',.95,1.07,bx.hz-.55,0,.3);
  box(.07,.07,.64,C.wood,.95,1.07,bx.hz-.84,0,.3);
  // A low stone forge with a warm coal opening; no animation or new rule.
  box(1.28,1.25,1.15,C.stone,3.48,.65,bx.hz-.80);
  box(.85,.59,.04,C.dark,3.48,.79,bx.hz-.20);
  box(.65,.13,.06,'#c68446',3.48,.58,bx.hz-.18);
  for(const xx of [-.22,0,.22])part(new THREE.DodecahedronGeometry(.10,0),'#dfad64',3.48+xx,.69,bx.hz-.14);
  box(1.30,.12,1.18,'#737d75',3.48,1.35,bx.hz-.80);
  // Full-size hanging tools are legible from the gameplay camera.
  box(2.6,.95,.10,'#785e48',1.60,1.44,front+.22);
  for(const x of [.65,1.45,2.25]){
    box(.07,.61,.08,'#b9a474',x,1.45,front+.30);
    box(.45,.16,.11,'#a3aeaa',x,1.78,front+.32,0,0,(x-1.4)*.2);
  }
  shopLantern(b,-3.60,1.62,front+.34);
}
function provisions(b,bx) {
  const {box,part}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-2.05;
  shopShell(b,bx,front,2.55,{openBays:[[-1.35,5.0]]});
  shopDoor(b,3.15,front+.15);
  // Single-slope slate roof and a striped shop awning make this frontage
  // distinct from the fish hall, front-gabled workshop and two-storey inn.
  const roof=new THREE.BoxGeometry(w,.18,d-1.8),p=roof.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-p.getZ(i)*.18);
  roof.computeVertexNormals();part(roof,bx.roofColor,0,3.03,-.9);
  for(let z=-bx.hz+.15;z<front+.05;z+=.64)box(w-.05,.045,.065,darker(bx.roofColor,.86),0,3.03-(z+.9)*.18+.12,z,.18);
  for(let i=0;i<8;i++){
    const x=-3.97+i*.82;
    box(.82,.065,1.02,i%2?'#d8c9a2':'#778e6d',x,2.18,front+.59,.15);
    part(new THREE.SphereGeometry(.22,7,4).scale(1.8,.42,.36),i%2?'#d8c9a2':'#778e6d',x,2.06,front+1.08);
  }
  for(const x of [-4.30,1.90])box(.10,2.16,.10,C.wood,x,1.08,front+1.00);
  // Shelves have jars, rolled cloth and supply boxes instead of cottage windows.
  for(const yy of [.58,1.13,1.68]){
    box(4.6,.10,.50,C.wood,-1.25,yy,front+.40);
    for(let i=0;i<6;i++){
      const x=-3.20+i*.78;
      if(yy>1.4){box(.42,.30,.35,i%2?'#b1a283':'#839d96',x,yy+.20,front+.40);}
      else {part(new THREE.CylinderGeometry(.16,.18,.30,8),i%2?'#bf915a':'#9fa577',x,yy+.20,front+.40);}
    }
  }
  box(4.75,.13,1.02,'#a47c53',-1.3,.79,bx.hz-.63);
  for(const x of [-3.16,-1.30,.56]){
    box(1.5,.18,.84,C.wood,x,.94,bx.hz-.63);
    for(let i=0;i<4;i++)part(new THREE.SphereGeometry(.16,8,5),x< -2?'#bc7950':x<0?'#91a373':'#d3bb7e',x-.45+i*.3,1.10,bx.hz-.63+(i%2)*.12);
  }
  for(const x of [2.1,4.1]){
    part(new THREE.SphereGeometry(.40,9,6).scale(.8,1.2,.9),'#c4b28a',x,.51,bx.hz-.59);
    part(new THREE.TorusGeometry(.17,.045,5,12),C.wood,x,.90,bx.hz-.59,Math.PI/2);
  }
  // A large crate-and-loaf sign sits beside the offset entrance.
  box(1.15,.70,.10,C.wood,3.15,2.38,front+.21);
  part(new THREE.SphereGeometry(.24,8,5).scale(1.65,.65,.16),'#dec58f',3.15,2.42,front+.29);
}
function netterShop(b,bx) {
  const {box,part}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-1.85;
  shopShell(b,bx,front,2.4,{timber:true,openBays:[[-1.35,4.6]]});
  shopRoof(b,w,d-1.6,2.4,1.15,-.8,bx.roofColor,{hip:true});
  shopDoor(b,3.15,front+.15);
  box(4.9,.10,.9,'#78928b',-1.35,2.14,front+.56,.10);
  for(const x of [-3.72,1.02])box(.11,2.12,.11,C.wood,x,1.06,front+.98);
  // A hanging, sagging net and buoy rack distinguish the tackle frontage.
  for(let i=0;i<11;i++){
    const x=-3.35+i*.36,sag=Math.sin(i/10*Math.PI)*.18;
    box(.022,1.15,.022,'#94a38c',x,1.26-sag,front+.26);
  }
  for(let i=0;i<6;i++)for(let j=0;j<10;j++){
    const x=-3.17+j*.36,sag=Math.sin((j+.5)/10*Math.PI)*.18;
    box(.37,.022,.022,'#94a38c',x,.75+i*.22-sag,front+.26,0,0,Math.cos((j+.5)/10*Math.PI)*-.14);
  }
  box(3.5,.12,.8,'#a1845e',-1.65,.76,bx.hz-.53);
  for(const x of [-2.8,-1.65,-.5])for(let i=0;i<3;i++)part(new THREE.TorusGeometry(.32-i*.075,.03,5,14),C.rope,x,.85,bx.hz-.53,Math.PI/2);
  for(const x of [.55,1.15]){
    box(.02,.67,.02,C.rope,x,1.57,front+.42);
    part(new THREE.SphereGeometry(.20,8,6).scale(.8,1.2,.8),x<1?'#cd9866':'#9aafa0',x,1.27,front+.42);
  }
  box(1.20,.70,.10,'#607c75',3.15,2.39,front+.20);
  part(new THREE.TorusGeometry(.23,.045,5,12),'#e0d0a7',3.15,2.4,front+.27);
  shopLantern(b,2.25,1.6,front+.26);
}
function sailShop(b,bx) {
  const {box,part}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-1.85;
  shopShell(b,bx,front,2.45,{openBays:[[1.0,4.5]]});
  shopRoof(b,w,d-1.6,2.45,1.18,-.8,bx.roofColor,{frontGable:true});
  shopDoor(b,-3.15,front+.15);
  // Warm cloth shade and a sail pictogram, with rolls and a cutting table.
  for(let i=0;i<7;i++)box(.85,.06,.90,i%2?'#e2d3ac':'#b79268',-.95+i*.85,2.17,front+.57,.13);
  for(const x of [-1.35,4.15])box(.11,2.13,.11,C.wood,x,1.06,front+1.0);
  box(3.75,.14,1.0,'#a3845e',1.2,.80,bx.hz-.59);
  for(const x of [-.35,2.75])for(const z of [-.36,.36])box(.12,.74,.12,C.wood,x,.37,bx.hz-.59+z);
  box(2.7,.035,.80,'#e3d6b2',1.3,.89,bx.hz-.61,0,.10);
  for(const x of [-.1,.6,1.3,2.0,2.7]){
    part(new THREE.CylinderGeometry(.19,.19,.74,8),x%1> .4?'#9eada3':'#d7c79e',x,1.32,front+.28,Math.PI/2);
    part(new THREE.CylinderGeometry(.095,.095,.012,8),C.dark,x,1.32,front+.66,Math.PI/2);
  }
  box(1.45,.75,.12,C.wood,-3.15,2.41,front+.21);
  box(.045,.58,.035,'#e2d5b1',-3.36,2.42,front+.30);
  const sail=new THREE.BufferGeometry();
  sail.setAttribute('position',new THREE.Float32BufferAttribute([-.13,-.24,0,-.13,.27,0,.40,-.21,0],3));sail.computeVertexNormals();
  part(sail,'#e2d5b1',-3.15,2.43,front+.31);
  shopLantern(b,-2.28,1.63,front+.28);
}
function harborInn(b,bx) {
  const {box,part}=b,w=bx.hx*2,d=bx.hz*2,front=bx.hz-1.95,roofZ=-.90;
  shopShell(b,bx,front,4.46);
  shopRoof(b,w,d-1.8,4.46,1.35,roofZ,bx.roofColor,{hip:true});
  box(w-.42,.18,.18,C.wood,0,2.46,front+.10);
  const outerWindow=Math.min(5.25,bx.hx-1.0);
  const innerWindow=Math.min(2.70,outerWindow-2.1);
  for(const x of [-outerWindow,-innerWindow,innerWindow,outerWindow]){
    shopWindow(b,x,3.38,front+.11,1.18,1.1,'#708c80');
    box(.12,1.70,.12,C.wood,x,3.45,front+.05);
  }
  for(const side of [-1,1])box(.10,1.4,.10,C.wood,side*1.6,3.40,front+.13,0,0,side*.55);
  shopDoor(b,0,front+.18,2.10);
  for(const x of [-3.5,3.5])shopWindow(b,x,1.43,front+.12,1.7,1.00,'#708c80');
  // Small dormer is part of the low roof, without a tower or grand balcony.
  box(2.15,.72,.86,bx.wallColor,0,4.62,front-.56);
  part(roofGeometry(1.05,2.45,.52,false),bx.roofColor,0,4.93,front-.55,0,Math.PI/2);
  shopWindow(b,0,4.65,front-.09,.83,.48,'#708c80');
  // Shallow timber porch, two round tables and benches read as hospitality.
  box(Math.min(10.85,w-1.2),.12,.87,'#9b8464',0,2.43,front+.58,.08);
  const porchPost=Math.min(5.35,bx.hx-.6);
  for(const x of [-porchPost,porchPost])box(.14,2.44,.14,C.wood,x,1.22,front+.98);
  box(Math.min(10.8,w-1.2),.13,.13,C.wood,0,2.24,front+1.00);
  for(const x of [-3.50,3.50]){
    part(new THREE.CylinderGeometry(.56,.56,.11,12),'#a4865d',x,.79,bx.hz-.65);
    part(new THREE.CylinderGeometry(.10,.16,.74,7),C.wood,x,.37,bx.hz-.65);
    for(const side of [-1,1]){
      box(.45,.12,.53,C.wood,x+side*.97,.47,bx.hz-.65);
      box(.08,.42,.50,C.wood,x+side*1.14,.71,bx.hz-.65);
      for(const zz of [-.18,.18])box(.08,.42,.08,C.wood,x+side*.97,.21,bx.hz-.65+zz);
    }
    part(new THREE.CylinderGeometry(.085,.085,.16,8),'#e1d6b8',x-.20,.925,bx.hz-.65);
    part(new THREE.TorusGeometry(.06,.015,5,9),'#e1d6b8',x-.09,.925,bx.hz-.65,0,Math.PI/2);
  }
  for(const side of [-1,1]){
    shopLantern(b,side*.95,1.70,front+.32);
    const potX=side*Math.min(6.10,bx.hx-.6);
    part(new THREE.CylinderGeometry(.37,.27,.55,8),'#b58061',potX,.30,bx.hz-.62);
    part(new THREE.DodecahedronGeometry(.43,0),C.leaf,potX,.77,bx.hz-.62);
  }
  box(1.24,.75,.12,'#708c80',-1.50,2.05,front+1.06);
  box(.80,.11,.045,'#e6d5ad',-1.50,2.02,front+1.15);
  for(const dx of [-.34,.34])box(.065,.32,.045,'#e6d5ad',-1.50+dx,2.04,front+1.15);
  box(.23,.15,.045,'#e6d5ad',-1.70,2.16,front+1.15);
}

export function marketBuilding(bx,y) {
  const b=builder(),{box}=b,w=bx.hx*2,d=bx.hz*2;
  // The complete exterior plot, including counters/porch, fits its collider.
  box(w,.12,d,C.stone,0,.06,0);
  box(1.45,.055,.60,'#b8b49d',0,.028,bx.hz-.30);
  if(bx.variant==='fish_hall')fishHall(b,bx);
  else if(bx.variant==='workshop')craftHouse(b,bx);
  else if(bx.variant==='provisioner')provisions(b,bx);
  else if(bx.variant==='netter_shop')netterShop(b,bx);
  else if(bx.variant==='sail_shop')sailShop(b,bx);
  else harborInn(b,bx);
  const root=b.finish();root.position.set(bx.x,y,bx.z);root.rotation.y=bx.angle;return root;
}

export function marketStall(bx,color,y,fish) {
  const b=builder(),{box,part}=b,w=bx.hx*2,d=bx.hz*2;
  const stock=bx.stock||(fish?'fish':'produce'),front=bx.openCounter ? .22 : bx.hz-.02;
  box(w,.14,d-.12,C.wood,0,.95,0);box(w-.05,.86,.1,'#9b7954',0,.48,d/2-.12);
  for(const x of [-bx.hx+.12,bx.hx-.12])for(const z of [-bx.hz+.12,front-.10])box(.12,2.4,.12,C.wood,x,1.2,z);
  // Short rear awnings expose the trading counters from the production camera.
  const pos=[],idx=[],steps=10,backZ=-bx.hz+.02;
  for(let j=0;j<=steps;j++)for(const x of [-bx.hx+.02,bx.hx-.02]){
    const t=j/steps;pos.push(x,2.45-Math.sin(t*Math.PI)*.14-t*.09,backZ+t*(front-backZ));
  }
  for(let j=0;j<steps;j++){const k=j*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
  const fabric=new THREE.BufferGeometry();fabric.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));fabric.setIndex(idx);fabric.computeVertexNormals();
  const underside=fabric.clone();underside.setIndex(idx.flatMap((_,i)=>i%3===0?[idx[i],idx[i+2],idx[i+1]]:[]));underside.computeVertexNormals();
  part(fabric,color);part(underside,color);
  for(let i=0;i<6;i++){const x=-bx.hx+.28+i*(w-.56)/5;part(new THREE.SphereGeometry(.18,7,4).scale(1,.42,.33),color,x,2.34,front-.04);}
  const goodsZ=bx.openCounter ? .44 : 0;
  for(const x of [-.75,.75]){
    box(1.2,.11,.95,C.dark,x,1.06,goodsZ);
    for(const z of [-.44,.44])box(1.2,.15,.055,C.wood,x,1.14,goodsZ+z);
    if(stock==='cloth'){
      for(let i=0;i<3;i++){
        const xx=x-.36+i*.35;
        part(new THREE.CylinderGeometry(.13,.13,.64,8),i%2?'#d7bd85':'#c7d3c6',xx,1.22,goodsZ,Math.PI/2);
        part(new THREE.CylinderGeometry(.055,.055,.018,8),C.wood,xx,1.22,goodsZ+.33,Math.PI/2);
      }
    }else if(stock==='rope'){
      for(let i=0;i<3;i++)part(new THREE.TorusGeometry(.23-i*.06,.022,5,12),C.rope,x,1.16,goodsZ,Math.PI/2);
      part(new THREE.SphereGeometry(.12,8,5).scale(1,1.5,1),'#c99c62',x+.4,1.28,goodsZ);
    }else for(let i=0;i<4;i++){
      if(stock==='fish'){
        part(new THREE.SphereGeometry(.19,8,5).scale(.68,.35,1.7),i%2?C.fish:'#879ea0',x-.39+i*.26,1.17,goodsZ,0,(i%2-.5)*.15);
        part(new THREE.ConeGeometry(.1,.17,3),C.fish,x-.39+i*.26,1.17,goodsZ-.37,Math.PI/2);
      }else{
        for(const dz of [-.16,.13])part(new THREE.SphereGeometry(.115,8,5),i%2?'#a7b16b':'#c29458',x-.38+i*.25,1.22,goodsZ+dz);
      }
    }
  }
  box(w-.25,.08,.08,C.wood,0,1.95,-bx.hz+.14);
  for(const x of [-.95,0,.95]){
    if(stock==='fish'){
      part(new THREE.CylinderGeometry(.012,.012,.22,5),C.rope,x,1.82,-bx.hz+.15);
      part(new THREE.SphereGeometry(.16,8,5).scale(.58,1.5,.45),C.fish,x,1.58,-bx.hz+.15);
    }else{
      part(new THREE.CylinderGeometry(.22,.19,.35,8),'#b5a27b',x,.25,.05);
      for(let i=0;i<3;i++)part(new THREE.SphereGeometry(.09,7,5),'#ba8052',x+(i-1)*.10,.46,.05);
    }
  }
  // Storage stays beneath the counter footprint, leaving the shared aisle open.
  if(bx.openCounter)for(const x of [-.8,.8]){
    box(.70,.38,.62,'#a88b60',x,.23,-.46);
    for(const dx of [-.25,.25])box(.055,.42,.035,C.wood,x+dx,.23,-.12);
  }
  // Rear displays identify the facing supply row from the south-facing camera.
  if(bx.openCounter&&stock!=='fish'){
    const back=-bx.hz+.07;
    for(const x of [-.72,0,.72]){
      if(stock==='cloth'){
        box(.50,.49,.05,x===0?'#c7d3c6':'#d7bd85',x,1.48,back);
        box(.56,.06,.06,C.wood,x,1.74,back);
      }else if(stock==='rope'){
        for(const r of [.20,.15,.10])part(new THREE.TorusGeometry(r,.022,5,12),C.rope,x,1.46,back);
      }else{
        part(new THREE.CylinderGeometry(.20,.17,.29,8),'#b5a27b',x,1.35,back+.10);
        for(const dx of [-.08,.08])part(new THREE.SphereGeometry(.095,7,5),x===0?'#a7b16b':'#c29458',x+dx,1.51,back+.10);
      }
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
  const sea=world.data.sea, shore=sea.coastline || sea.shore;
  // The low coping follows the same curve as water/collision; no separate coast.
  for(let i=1;i<shore.length;i++){
    const a=shore[i-1],c=shore[i];
    if(sea.coastline){if(!['quay','shipyard','breakwater'].includes(sea.coastKinds?.[i-1]))continue;}
    else if(a[0]<range[0]||c[0]>range[1])continue;
    let spans=[[0,1]];
    // Clip only the portion occupied by a joining deck, rather than dropping a full
    // shoreline segment and leaving an oversized notch at each approach.
    for(const d of world.docks){
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
    const {x,z}=fromBoxLocal(d,d.hx-.45,2),y=d.height;
    for(let i=0;i<3;i++)part(new THREE.TorusGeometry(.35-i*.08,.035,5,16),C.rope,x,y+.05,z,Math.PI/2);
    for(let i=0;i<7;i++) {const p=fromBoxLocal(d,-d.hx+.2,-1+i*.28);box(.023,.78,.023,'#8f9b82',p.x,y-.25,p.z);}
    for(let i=0;i<4;i++) {const p=fromBoxLocal(d,-d.hx+.2,-.15);box(.023,.025,1.7,'#8f9b82',p.x,y-.56+i*.23,p.z,0,d.angle);}
    for(let i=0;i<3;i++) {const p=fromBoxLocal(d,-d.hx+.2,-.8+i*.6);part(new THREE.SphereGeometry(.12,8,5),'#b9905f',p.x,y+.10,p.z);}
  }
  for(const cargo of world.data.harbor.dockCargo || []) {
    cargoGroups.push(marketDockCargo(cargo,world.groundY(cargo.x,cargo.z)));
  }
  for(const index of world.data.town.styleSlice.boatIndices || []) {
    const [x,z,angle]=world.data.harbor.boats[index];
    const berth=world.docks.filter(d=>d.kind==='pier'&&!d.rampFromTerrain).sort((a,c)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(c.x-x,c.z-z))[0];
    if(!berth)continue;
    const side=Math.sign(toBoxLocal({x,z,angle},berth.x,berth.z).lx)||1;
    for(const zz of [-1.8,1.8]) {
      const sx=x+Math.cos(angle)*side*1.05+Math.sin(angle)*zz;
      const sz=z-Math.sin(angle)*side*1.05+Math.cos(angle)*zz;
      const local=toBoxLocal(berth,sx,sz);
      const anchor=fromBoxLocal(berth,Math.sign(local.lx)*(berth.hx-.12),clamp(local.lz,-berth.hz+.4,berth.hz-.4));
      const ex=anchor.x,ez=anchor.z;
      const start=new THREE.Vector3(sx,world.waterLevel+.69,sz),end=new THREE.Vector3(ex,berth.height+.12,ez);
      const middle=start.clone().lerp(end,.5);middle.y-=.15;
      part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start,middle,end]),8,.025,5,false),C.rope);
      part(new THREE.CylinderGeometry(.055,.08,.22,6),C.wood,ex,berth.height+.11,ez);
    }
  }
  const root=b.finish();root.userData.waterContact=true;root.add(...cargoGroups);return root;
}

/** Open working boat for authored harbour berths; no sailing logic. */
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
    // two rubbing strakes follow the planking down the side, standing just proud of it
    for(const v of [.32,.62]){
      const at=q=>[q[0]*(1-v*.38)*1.025,.50-.86*v,q[1]*(1-v*.12)];
      const p0=at(a),p1=at(c);
      box(.05,.07,Math.hypot(p1[0]-p0[0],p1[2]-p0[2])+.03,'#6f5238',(p0[0]+p1[0])/2,p0[1],(p0[2]+p1[2])/2,0,Math.atan2(p1[0]-p0[0],p1[2]-p0[2]));
    }
  }
  // Ribs cross the open floor and rise up the inside of the hull.
  const halfWidth=z=>{for(let i=5;i<rim.length-1;i++){const a=rim[i],c=rim[i+1];if(z<=a[1]&&z>=c[1])return a[0]+(c[0]-a[0])*(z-a[1])/(c[1]-a[1]);}return .4;};
  for(let z=-2.75;z<3.1;z+=.62){
    const half=halfWidth(z)*.80;
    box(half*2,.05,.08,'#8d6c4a',0,.14,z*.94);
    for(const side of [-1,1])box(.07,.36,.08,'#8d6c4a',side*half*1.03,.32,z*.94,0,0,-side*.28);
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
  const root=b.finish();root.userData.waterContact=true;root.position.set(x,water+.15,z);root.rotation.y=angle;return root;
}
