// Original pieces for Greyfang Den: the wolf den's cave (a dark mouth under a heavy rock lintel in
// the face of the rock mass), a fallen log by it with a skull and scattered bones, tall weathered
// rock pillars round the clearing and old trees with flaring roots. Shared helpers: the Old Root
// Stone Ring's coloured parts and bark-style rooted trees.
let CAVE=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
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

const BONE='#e9e3d3';
// the cave: a dark opening in the rock face between foot points u0 and u1 at screen v, its top at vt
function caveMouth(u0,u1,v,vt){
 const[ax,az]=P(u0,v,0),[bx,bz]=P(u1,v,0),mx=(ax+bx)/2,mz=(az+bz)/2,w=Math.hypot(bx-ax,bz-az),y=height(mx,mz),h=tall(mx,mz,y,vt);
 // the dark: a half-oval of deep shadow, darkest in its heart, standing just proud of the face
 const shape=new THREE.Shape(),n=24;
 shape.moveTo(-w/2,0);for(let i=0;i<=n;i++){const a=Math.PI*(1-i/n);shape.lineTo(Math.cos(a)*w/2*(1+.06*Math.sin(i*1.7)),Math.sin(a)*h*(1+.05*Math.sin(i*2.3)));}shape.lineTo(w/2,0);
 const g=new THREE.ShapeGeometry(shape,6),pos=g.attributes.position,col=new Float32Array(pos.count*3),deep=new THREE.Color('#141a18'),rim=new THREE.Color('#3b4440');
 for(let i=0;i<pos.count;i++){const k=Math.min(1,Math.hypot(pos.getX(i)/(w/2),pos.getY(i)/h));const c=deep.clone().lerp(rim,Math.pow(k,3));col.set([c.r,c.g,c.b],i*3);}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));g.translate(mx,y-.05,mz+M(.45));
 const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true}));m.name='den-cave';scene.add(m);
 // the floor runs dark into it
 const f=new THREE.CircleGeometry(1,24,0,Math.PI);f.rotateX(-Math.PI/2);f.scale(w*.5,1,w*.45);f.translate(mx,y+.03,mz+M(.45));
 const fm=new THREE.Mesh(f,new THREE.MeshBasicMaterial({color:'#2a2f2a',transparent:true,opacity:.55,depthWrite:false}));scene.add(fm);
 // a heavy lintel of rock over it and boulders at its sides
 fieldStone(mx,y+h*.92,mz+M(.55),w*1.15,h*.3,M(1.3),{ry:R(-.05,.05),moss:.35,chamfer:.25,base:'#b9b6ae'});
 for(const s of[-1,1]){const x=mx+s*w*.62,z=mz+M(.7);fieldStone(x,y-M(.3),z,w*.42,h*.95+M(.3),M(1.5),{ry:R(-.2,.2),moss:.6,chamfer:.3});COLLIDERS.push({x,z,r:w*.22});}
 COLLIDERS.push({x:mx,z:mz,r:w*.42});
 CAVE={x:mx,z:mz,y,w,h};
}
// a fallen log, its bark the game trunk's, broken off at both ends
function fallenLog(u0,v0,u1,v1){
 const[ax,ay,az]=onGround(u0,v0),[bx,by,bz]=onGround(u1,v1),r=M(.38),pts=[];
 for(let j=0;j<=8;j++){const t=j/8;pts.push(new V3(ax+(bx-ax)*t,ay+(by-ay)*t+r*.85+Math.sin(t*3)*M(.05),az+(bz-az)*t));}
 rootParts.push(barkTube(pts,r,r*.8,16));
 // a broken branch stub and a few splinters
 const mid=pts[3];rootParts.push(barkTube([mid,mid.clone().add(new V3(M(.4),M(.7),M(.2))),mid.clone().add(new V3(M(.6),M(1.1),M(.15)))],r*.35,r*.12,6));
 for(let k=0;k<2;k++){const t=k?1:0,p=pts[t*8];for(let s=0;s<4;s++)rootParts.push(barkTube([p.clone(),p.clone().add(new V3((t?1:-1)*M(R(.2,.45)),R(-.2,.4)*M(1),R(-.3,.3)*M(1)))],r*.22,r*.05,3));}
 for(let s=0;s<6;s++){const t=(s+.5)/6,x=ax+(bx-ax)*t,z=az+(bz-az)*t;COLLIDERS.push({x,z,r:r*1.05});}
}
// bones: a skull and long bones lying about the den's mouth and the log
function bone(x,z,len,ry){
 const y=height(x,z),g=new THREE.CylinderGeometry(M(.05),M(.05),len,6);g.rotateZ(Math.PI/2);g.rotateY(ry);g.translate(x,y+M(.05),z);stoneParts.push(coloredPart(g,BONE));
 for(const s of[-1,1]){const k=new THREE.SphereGeometry(M(.08),6,4);k.translate(x+Math.cos(ry)*len/2*s,y+M(.06),z-Math.sin(ry)*len/2*s);stoneParts.push(coloredPart(k,BONE));}
}
function skull(x,z,ry){
 const y=height(x,z),s=M(.32),head=new THREE.SphereGeometry(s,10,8);head.scale(1,.85,1.2);head.translate(x,y+s*.75,z);stoneParts.push(coloredPart(head,BONE));
 const snout=new THREE.BoxGeometry(s*.9,s*.55,s*1.2);snout.rotateY(ry);snout.translate(x+Math.sin(ry)*s*.95,y+s*.45,z+Math.cos(ry)*s*.95);stoneParts.push(coloredPart(snout,'#ddd6c4'));
 for(const e of[-1,1]){const eye=new THREE.SphereGeometry(s*.22,6,4);eye.translate(x+Math.sin(ry)*s*.7+Math.cos(ry)*e*s*.38,y+s*.95,z+Math.cos(ry)*s*.7-Math.sin(ry)*e*s*.38);stoneParts.push(coloredPart(eye,'#3a3530'));}
}
