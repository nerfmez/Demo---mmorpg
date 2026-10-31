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
// the cave (owner, 31 October 2026: a real cave that can be walked into, not a painted mouth): the
// cave path runs into the rock mass under an arched tunnel whose walls and roof are rock, darker the
// deeper they go, closed at the back. Above the tunnel the rock mass is filled back to its top, an arch
// of big stones frames the mouth, and the tunnel's floor darkens inwards.
function caveTunnel(u0,v0,u1,v1,width,roofH){
 const[ax,az]=P(u0,v0,0),[bx,bz]=P(u1,v1,0),len=Math.hypot(bx-ax,bz-az),dir=new V3((bx-ax)/len,0,(bz-az)/len),side=new V3(-dir.z,0,dir.x);
 const N=12,K=14,pos=[],col=[],idx=[],rim=new THREE.Color('#6b675e'),mid=new THREE.Color('#2e2f2b'),deep=new THREE.Color('#0b0d0c');
 const ring=t=>{const x=ax+(bx-ax)*t,z=az+(bz-az)*t;return{x,z,y:height(x,z),rw:width/2*(1-.18*t),h:roofH*(1-.22*t)};};
 for(let j=0;j<=N;j++){
  const t=j/N,R0=ring(t);
  for(let k=0;k<=K;k++){
   const a=Math.PI*k/K,wob=1+.06*Math.sin(j*1.9+k*2.3);
   const p=new V3(R0.x,R0.y-.15,R0.z).addScaledVector(side,Math.cos(a)*R0.rw*wob).add(new V3(0,Math.sin(a)*R0.h*wob,0));
   pos.push(p.x,p.y,p.z);
   const c=t<.18?rim.clone().lerp(mid,t/.18):mid.clone().lerp(deep,Math.min(1,(t-.18)/.4));c.multiplyScalar(.72+.28*Math.pow(Math.sin(a),.5)*(1-t));col.push(c.r,c.g,c.b);
  }
 }
 for(let j=0;j<N;j++)for(let k=0;k<K;k++){const a=j*(K+1)+k,b=a+K+1;idx.push(a,b,a+1,a+1,b,b+1);}
 // the back of the den: a dark wall closing the tunnel
 const end=ring(1),c0=pos.length/3;pos.push(end.x+dir.x*.2,end.y+end.h*.35,end.z+dir.z*.2);col.push(deep.r*.6,deep.g*.6,deep.b*.6);
 for(let k=0;k<=K;k++){const v=N*(K+1)+k;if(k<K)idx.push(c0,v,v+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
 const tunnel=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));tunnel.name='den-tunnel';scene.add(tunnel);
 // the floor darkens inwards
 const fl=[],fc=[],fi=[];
 for(let j=0;j<=N;j++){const R0=ring(j/N);for(const s of[-1,1]){const p=new V3(R0.x,height(R0.x,R0.z)+.04,R0.z).addScaledVector(side,s*R0.rw*.98);fl.push(p.x,p.y,p.z);fc.push(0,0,0,Math.min(.95,.35+j/N*1.2));}}
 for(let j=0;j<N;j++){const a=j*2;fi.push(a,a+2,a+1,a+1,a+2,a+3);}
 const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(fl,3));fg.setAttribute('color',new THREE.Float32BufferAttribute(fc,4));fg.setIndex(fi);
 const floor=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide}));floor.renderOrder=2;scene.add(floor);
 // the rock over the tunnel, filled back up to the mass's top, moss and shrubs on it
 const top=M(5.6);
 for(let j=0;j<N;j++){
  const t=(j+.5)/N,R0=ring(t),y0=R0.y+R0.h*.8,ry=Math.atan2(dir.x,dir.z);
  // mossy boulders heaped over the roof, their tops as ragged as the rock round them
  for(const s of[-.45,.45]){const p=new V3(R0.x,0,R0.z).addScaledVector(side,s*width*.55),hh=Math.max(.6,top-y0+M(R(-.3,.5)));
   fieldStone(p.x,y0,p.z,width*R(.85,1.05),hh,len/N*R(1.6,2),{ry:ry+R(-.4,.4),moss:.85,chamfer:.35});}
  for(let k=0;k<5;k++)addBush(R0.x+R(-.7,.7)*width,top-M(.2),R0.z+R(-.5,.5)*len/N,M(R(.4,.65)),{sy:.7,tint:R(-.1,.15)});
 }
 // the arch of big mossy stones round the mouth
 const m=ring(0);
 for(let k=0;k<=8;k++){
  const a=Math.PI*k/8,p=new V3(m.x,m.y,m.z).addScaledVector(side,Math.cos(a)*(m.rw+M(.55))).add(new V3(0,Math.sin(a)*(m.h+M(.45)),0)).addScaledVector(dir,-M(.35));
  const s=M(R(1.2,1.6));fieldStone(p.x,p.y-s*.55,p.z,s,s*1.05,s*.9,{ry:R(-.3,.3),moss:k>2&&k<6?.8:.5,chamfer:.3});
 }
 // walls: the tunnel's sides and back are solid, the floor between them walkable
 for(let j=0;j<=N;j++){const R0=ring(j/N);for(const s of[-1,1]){const p=new V3(R0.x,0,R0.z).addScaledVector(side,s*(R0.rw+M(.2)));COLLIDERS.push({x:p.x,z:p.z,r:M(.5)});}}
 COLLIDERS.push({x:end.x+dir.x*M(.4),z:end.z+dir.z*M(.4),r:end.rw});
 CAVE={x:(ax+bx)/2,z:(az+bz)/2,ax,az,bx,bz,w:width,h:roofH,len};
 return{ring,dir,side};
}
// the den's keepers: two pale eyes shining in the dark at the back, and bones on its floor
function denInside(t){
 const e=t.ring(.92);
 for(const s of[-1,1]){const p=new V3(e.x,e.y+e.h*.32,e.z).addScaledVector(t.side,s*M(.32)).addScaledVector(t.dir,-M(.3));const g=new THREE.SphereGeometry(M(.09),8,6);g.scale(1.4,.8,1);const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:'#ffe9a6'}));m.position.copy(p);m.name='den-eyes';scene.add(m);}
 for(const[t0,off,len,ry]of[[.25,-.5,.6,.5],[.4,.4,.5,-.8],[.55,-.3,.55,1.2],[.7,.35,.45,.2]]){const p=t.ring(t0),q=new V3(p.x,0,p.z).addScaledVector(t.side,off*p.rw);bone(q.x,q.z,M(len),ry);}
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
