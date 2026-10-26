// Original pieces for Moonstone Camp: two canvas tents and a red banner under the rock terrace, a
// ring-stone campfire with log benches, crates and firewood, the moonstone on its rock pedestal
// (a tall pale stone with a glowing crescent, as the region concept's), old rooted trees and
// Moonroot's glowing plants.
let MOONSTONE=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const MOON_STONE=['#c9cfc9','#bec5c0','#d3d8d2','#b5bdb8'];
const campParts=[],canvasParts=[];
const place=(g,x,y,z,ry=0)=>g.applyMatrix4(new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry),new V3(1,1,1)));
// An A-frame canvas tent, open at the front with its flaps tied back, poles crossing over the ridge.
function tent(u0,u1,vFoot,vTop,ry=0){
 const[x,z]=P((u0+u1)/2,vFoot,0),y=height(x,z)-.05,W=wide(u0,u1,vFoot,0)*.95,H=tall(x,z,y,vTop)*.62,D=W*1.05,h2=W/2;
 const tri=(a,b,c,col)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c],3));g.computeVertexNormals();return coloredPart(g,col);};
 const quad=(a,b,c,d,col)=>[tri(a,b,c,col),tri(a,c,d,col)];
 const F=D/2,B=-D/2,cloth='#e9dfc3',shade='#cfc2a2',dark='#b8aa88';
 const parts=[
  ...quad([-h2,0,F],[0,H,F],[0,H,B],[-h2,0,B],cloth),...quad([h2,0,F],[h2,0,B],[0,H,B],[0,H,F],shade),
  tri([-h2,0,B],[0,H,B],[h2,0,B],dark),
  // the front flaps, tied back to each side
  tri([-h2,0,F],[-h2*.45,H*.55,F+.02],[-h2*.75,0,F+.25],shade),tri([h2,0,F],[h2*.75,0,F+.25],[h2*.45,H*.55,F+.02],cloth),
  // the dark inside seen through the opening
  tri([-h2*.6,0,F-.05],[0,H*.85,F-.05],[h2*.6,0,F-.05],'#3e3a33')
 ];
 for(const g of parts){g.applyMatrix4(new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry),new V3(1,1,1)));canvasParts.push(g);}
 // poles: two at each end, crossing over the ridge
 for(const pz of[F+.05,B-.05])for(const s of[-1,1]){
  const a=new V3(s*h2*.15,0,pz),b=new V3(-s*h2*.12,H*1.18,pz),g=new THREE.CylinderGeometry(.05,.06,a.distanceTo(b),5);
  g.translate(0,a.distanceTo(b)/2,0);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),b.clone().sub(a).normalize()));g.translate(a.x,a.y,a.z);
  campParts.push(coloredPart(place(g,x,y,z,ry),'#8a6b47'));
 }
 const ridge=new THREE.CylinderGeometry(.045,.045,D+.3,5);ridge.rotateX(Math.PI/2);ridge.translate(0,H,0);campParts.push(coloredPart(place(ridge,x,y,z,ry),'#7d5f3d'));
 COLLIDERS.push({x,z,w:W*.95,d:D,ry,box:true});
 return{x,y,z,W,H,D,ry};
}
function banner(u,vFoot,vTop){
 // a red cloth on a pole beside the small tent, as the reference's
 const[x,z]=P(u,vFoot,0),y=height(x,z),H=tall(x,z,y,vTop),pole=new THREE.CylinderGeometry(.05,.06,H,5);pole.translate(x,y+H/2,z);campParts.push(coloredPart(pole,'#7d5f3d'));
 const arm=new THREE.BoxGeometry(M(.45),.06,.06);arm.translate(x+M(.2),y+H*.95,z);campParts.push(coloredPart(arm,'#7d5f3d'));
 const cloth=new THREE.PlaneGeometry(M(.36),H*.62,1,3);const p=cloth.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,.05*Math.sin(p.getY(i)*3));cloth.translate(x+M(.22),y+H*.95-H*.31,z+.06);
 canvasParts.push(coloredPart(cloth,'#c2453b'));
 COLLIDERS.push({x,z,r:.2});
}
let FIRE=null;
function campfire(u,v){
 const[x,z]=P(u,v,0),y=height(x,z),R0=M(.6);
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2;addStone(x+Math.cos(a)*R0,y-.06,z+Math.sin(a)*R0,M(.2),M(.14),M(.17),{extra:5,chamfer:.3,moss:.05,base:pick(MOON_STONE),ry:a});}
 for(let i=0;i<4;i++){const a=i/4*Math.PI+R(-.2,.2),g=new THREE.CylinderGeometry(.08,.1,R0*1.5,6);g.rotateZ(Math.PI/2);g.rotateY(a);g.rotateZ(R(-.15,.15));g.translate(x,y+.12,z);campParts.push(coloredPart(g,i%2?'#6f5136':'#5e432c'));}
 const flame=new THREE.Group();
 for(const[r,h,c,o]of[[R0*.5,M(1.0),'#ff8a3d',.95],[R0*.32,M(.72),'#ffd25e',1]]){const g=new THREE.ConeGeometry(r,h,7);g.translate(0,h/2,0);const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o}));m.position.set(x,y+.1,z);flame.add(m);}
 const glow=new THREE.Mesh(new THREE.CircleGeometry(R0*2.3,24),new THREE.MeshBasicMaterial({color:'#ffb466',transparent:true,opacity:.22,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.set(x,y+.06,z);flame.add(glow);
 scene.add(flame);COLLIDERS.push({x,z,r:R0*1.1});FIRE={x,z,y,flame};
}
function logBench(u,v,ry){
 const[x,z]=P(u,v,0),y=height(x,z),L=M(1.4),g=new THREE.CylinderGeometry(M(.16),M(.17),L,7);g.rotateZ(Math.PI/2);g.translate(0,M(.16),0);campParts.push(coloredPart(place(g,x,y,z,ry),'#8a6747'));
 for(const s of[-1,1]){const c=new THREE.CircleGeometry(M(.16),7);c.rotateY(Math.PI/2*s);c.translate(s*L/2,M(.16),0);campParts.push(coloredPart(place(c,x,y,z,ry),'#c9a473'));}
 COLLIDERS.push({x,z,w:L,d:M(.3),ry,box:true});
}
function crate(u,v,s=1,stack=0){
 const[x,z]=P(u,v,0),y=height(x,z)+stack,w=M(.6)*s,g=new THREE.BoxGeometry(w,w,w);g.translate(x,y+w/2,z);campParts.push(coloredPart(g,'#a07d52'));
 for(const dy of[.08,.92]){const b=new THREE.BoxGeometry(w*1.02,w*.08,w*1.02);b.translate(x,y+w*dy,z);campParts.push(coloredPart(b,'#7a5b39'));}
 if(!stack)COLLIDERS.push({x,z,r:w*.65});
 return w;
}
function firewood(u,v){
 const[x,z]=P(u,v,0),y=height(x,z);
 for(let r=0;r<3;r++)for(let i=0;i<4-r;i++){const g=new THREE.CylinderGeometry(.09,.09,M(.6),6);g.rotateX(Math.PI/2);g.translate(x+(i-(3-r)/2)*.2,y+.1+r*.17,z);campParts.push(coloredPart(g,i%2?'#7c5a3a':'#8d6a45'));}
 COLLIDERS.push({x,z,r:M(.35)});
}
// The moonstone: a tall pale stone on a rock pedestal, a crescent glowing blue in its face and a
// soft blue light on the stone at its foot, as the region concept shows it.
function moonstone(u,vFoot,vTop){
 const[x,z]=P(u,vFoot,0),y=height(x,z),pw=wide(u-.045,u+.045,vFoot,0),ph=M(.75);
 addStone(x,y-.3,z,pw*.78,ph+.3,pw*.7,{extra:9,chamfer:.14,jitter:.12,moss:.65,base:pick(MOON_STONE),ry:R(-.4,.4)});
 const top=y+ph*.92,H=tall(x,z,top,vTop)*1.05,bw=pw*.5,g=new THREE.CylinderGeometry(bw*.5,bw*.56,H,10,6);
 // a tall standing stone with a rounded crown, flattened face-on, as the region concept's moonstone
 const p=g.attributes.position;for(let i=0;i<p.count;i++){const t=(p.getY(i)+H/2)/H,crown=t>.8?Math.sqrt(Math.max(0,1-((t-.8)/.2)**2)):1;p.setX(i,p.getX(i)*crown);p.setZ(i,p.getZ(i)*.55*crown);}
 g.translate(x,top+H/2-.05,z);const stone=new THREE.Mesh(coloredPart(g,'#d3dde5'),paint({vertexColors:true,shade:[.6,.68,.78],mid:[.9,.94,.98]}));stone.castShadow=true;scene.add(stone);
 const cres=new THREE.RingGeometry(bw*.16,bw*.26,22,1,Math.PI*.2,Math.PI*1.2);cres.translate(x,top+H*.6,z+bw*.56*.55+.05);
 const glowMat=new THREE.MeshBasicMaterial({color:'#86dcff',transparent:true,opacity:.95});scene.add(new THREE.Mesh(cres,glowMat));
 const halo=new THREE.Mesh(new THREE.CircleGeometry(bw*1.1,24),new THREE.MeshBasicMaterial({color:'#7fd6ff',transparent:true,opacity:.25,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.set(x,top+.05,z);scene.add(halo);
 COLLIDERS.push({x,z,r:pw*.55});MOONSTONE={x,z,y,top,H};
}
// Bark in the game trunk's own style (render/anime-study.js animeTrunk): nine flat facets round
// a curve, each toned light, mid or shadow by the sun, so roots match the trees (as Mirror Pond's).
const BARK_SUN=new V3(-.6,.55,.55).normalize();
function barkTube(pts,r0,r1,segments=14){
 const curve=new THREE.CatmullRomCurve3(pts),sides=9,p=[],n=[],c=[],light=new THREE.Color(FOL.trunk.light),mid=new THREE.Color(FOL.trunk.mid),shadow=new THREE.Color(FOL.trunk.shadow);
 const frames=curve.computeFrenetFrames(segments,false),rings=[];
 for(let j=0;j<=segments;j++){const t=j/segments,o=curve.getPointAt(t),r=r1+(r0-r1)*Math.pow(1-t,1.4);rings.push(Array.from({length:sides},(_,k)=>{const a=k/sides*Math.PI*2,no=frames.normals[j].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[j],Math.sin(a));return{v:o.clone().addScaledVector(no,r),no};}));}
 for(let j=0;j<segments;j++)for(let k=0;k<sides;k++){
  const kk=(k+1)%sides,q=[rings[j][k],rings[j][kk],rings[j+1][kk],rings[j+1][k]],normal=q[0].no.clone().add(q[1].no).normalize(),lit=normal.dot(BARK_SUN);
  const tone=lit>.33?mid.clone().lerp(light,THREE.MathUtils.smoothstep(lit,.33,.9)):shadow.clone().lerp(mid,THREE.MathUtils.smoothstep(lit,-.65,.33));
  for(const id of[0,1,2,0,2,3]){p.push(...q[id].v.toArray());n.push(...normal.toArray());c.push(tone.r,tone.g,tone.b);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));return g;
}
const barkPaint=()=>paint({vertexColors:true,shade:[.62,.62,.70],mid:[.62,.62,.70],band:[-5,-5]});
function trunkRadius(h){const sp=ANIME.trunk.spine;for(let i=1;i<sp.length;i++)if(h<=sp[i][1]){const t=(h-sp[i-1][1])/(sp[i][1]-sp[i-1][1]);return sp[i-1][3]+(sp[i][3]-sp[i-1][3])*t;}return sp.at(-1)[3];}
function rootPath(x,z,y0,s,a,hs,len,wobble){
 const pts=[],n=11,rt=trunkRadius(hs)*s,r0=trunkRadius(0)*s;
 pts.push(new V3(x+Math.cos(a)*rt*.35,y0+hs*s,z+Math.sin(a)*rt*.35));
 for(let j=1;j<=n;j++){
  const t=j/n,r=r0*.85+len*t,aa=a+Math.sin(t*2.6+wobble)*.3*t,px=x+Math.cos(aa)*r,pz=z+Math.sin(aa)*r;
  const rise=hs*s*.85*Math.pow(1-smooth(0,.28,t),1.6),sink=M(.04)*smooth(.55,1,t);
  pts.push(new V3(px,height(px,pz)+rise+M(.02)-sink,pz));
 }
 return pts;
}
// Old trees whose roots flare from the trunk, run half buried over the ground and fork.
const rootParts=[];
function rootTree(u,v,s,seed){
 const[x,y,z]=onGround(u,v);broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.38});
 const y0=y-.05,n=6+Math.floor(rand()*3),start=R(0,Math.PI*2);
 for(let k=0;k<n;k++){
  const a=start+k/n*Math.PI*2+R(-.3,.3),hs=R(.22,.4),len=s*R(1.1,1.9),thick=trunkRadius(hs)*s*R(.6,.72),pts=rootPath(x,z,y0,s,a,hs,len,R(0,6));
  rootParts.push(barkTube(pts,thick,thick*.12,20));
  for(let f=0;f<(rand()<.6?2:1);f++){
   const i0=Math.min(pts.length-2,Math.max(3,Math.round(R(.35,.6)*(pts.length-1)))),o=pts[i0],side=rand()<.5?-1:1,b=a+side*R(.45,.9),bl=len*R(.3,.5);
   const bp=[o.clone()];for(let j=1;j<=6;j++){const t=j/6,px=o.x+Math.cos(b)*bl*t,pz=o.z+Math.sin(b)*bl*t;bp.push(new V3(px,height(px,pz)+M(.02)-M(.04)*t,pz));}
   rootParts.push(barkTube(bp,thick*(1-i0/(pts.length-1))*.75,thick*.08,10));
  }
 }
}
// Moonroot's glow: little cyan bell-flowers and pale sprouts in the shade
function glowPlants(){
 const items=[];
 for(let i=0;i<900;i++){
  const[x,y,z]=onGround(R(-.05,1.05),R(-.05,1.0));
  if(trailEdge(x,z)<M(.5)||field(x,z).rock>.2||shadeAt(x,z)<.25&&rand()<.7)continue;
  items.push({x,y,z,s:R(.7,1.2),c:rand()<.55?'#8ff2e4':'#f2fbf2'});
 }
 const g=new THREE.SphereGeometry(.09,6,4);g.translate(0,.22,0);
 const stem=new THREE.CylinderGeometry(.012,.016,.22,3);stem.translate(0,.11,0);
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),col=new THREE.Color();
 const bulbs=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:'#ffffff'}),items.length),stems=new THREE.InstancedMesh(stem,paint({color:'#4f8a5e'}),items.length);
 items.forEach((it,i)=>{m.compose(new V3(it.x,it.y-.02,it.z),q.setFromAxisAngle(new V3(0,1,0),R(0,6)),new V3(it.s,it.s,it.s));bulbs.setMatrixAt(i,m);stems.setMatrixAt(i,m);bulbs.setColorAt(i,col.set(it.c));});
 scene.add(bulbs,stems);
}
