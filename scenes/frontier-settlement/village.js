// Original pieces for the Frontier Settlement: timber-framed plaster cottages with tiled gable roofs
// and stone chimneys, the bell tower on its stone base, market stalls with awnings and a banner, a
// fenced vegetable garden, benches and barrels under the great tree, dry-stone walls. Shared helpers
// from Greyfang Den: coloured parts, bark-style trunks and rooted trees.
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
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
// one set of painted materials for every building, as the approved windmill's
const HOUSE={wall:[],wood:[],roof:[],detail:[]};
const PLASTER=['#ece0c4','#e6d8ba','#efe4cb'],TIMBER=['#6e5236','#765a3b','#664b31'],TILE=['#a9563a','#b5633f','#9c4d33','#be6c45','#a45a3c'];
function hPart(kind,g,color,pos,quat){HOUSE[kind].push(coloredPart(g,color,new THREE.Matrix4().compose(pos,quat||new THREE.Quaternion(),new V3(1,1,1))));}
// a frame turning house-local points (x along the ridge, z out of the long front, y up) into the world
function hFrame(x,y,z,ry){const c=Math.cos(ry),s=Math.sin(ry),q=new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry);return{q,ry,at:(lx,ly,lz)=>new V3(x+lx*c+lz*s,y+ly,z-lx*s+lz*c)};}
function hBox(F,kind,lx,ly,lz,w,h,d,color,extra){hPart(kind,new THREE.BoxGeometry(w,h,d),color,F.at(lx,ly,lz),extra?F.q.clone().multiply(extra):F.q);}
function hBeam(F,a,b,w,color){const A=F.at(...a),B=F.at(...b),d=B.clone().sub(A);hPart('wood',new THREE.BoxGeometry(w,d.length(),w),color,A.clone().add(B).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),d.normalize()));}
// A cottage: a stone plinth, plaster walls in a dark timber frame, a steep tiled gable roof whose
// tiles run in staggered courses, a stone chimney, a plank door and shuttered windows; the door is on
// the gable end at +x (the concept's cottages show their gable and door to the path).
function cottage(u,v,{len,dep,wallH,roofH,ry,porch=false,chimney=1}){
 const[x,y,z]=onGround(u,v),F=hFrame(x,y,z,ry),L=len/2,D=dep/2,plinth=M(.38);
 // plinth of dressed stones, then the walls
 for(const[sx,sz,ll,dd]of[[0,D,len,0],[0,-D,len,0],[L,0,0,dep],[-L,0,0,dep]]){const n=Math.max(2,Math.round((ll||dd)/M(.55)));for(let i=0;i<n;i++){const t=(i+.5)/n-.5;hBox(F,'detail',sx+(ll?t*ll:0),plinth/2-.15,sz+(dd?t*dd:0),ll?ll/n*.96:M(.3),plinth+.3,dd?dd/n*.96:M(.3),pick(['#bdb6a6','#c9c1b0','#b1aa9b']));}}
 hBox(F,'wall',0,plinth+wallH/2,0,len-.1,wallH,dep-.1,pick(PLASTER));
 // the timber frame: sills, plates, corner posts, studs and braces on every face
 const T=pick(TIMBER),tw=M(.11),top=plinth+wallH;
 for(const sz of[D,-D]){hBeam(F,[-L,plinth,sz],[L,plinth,sz],tw,T);hBeam(F,[-L,top,sz],[L,top,sz],tw,T);hBeam(F,[-L,plinth+wallH*.52,sz],[L,plinth+wallH*.52,sz],tw*.8,T);
  for(let i=0;i<=4;i++){const lx=-L+i/4*len;hBeam(F,[lx,plinth,sz],[lx,top,sz],tw,T);}
  hBeam(F,[-L,plinth,sz],[-L+len/4,plinth+wallH*.52,sz],tw*.8,T);hBeam(F,[L,plinth,sz],[L-len/4,plinth+wallH*.52,sz],tw*.8,T);}
 for(const sx of[L,-L]){hBeam(F,[sx,plinth,-D],[sx,plinth,D],tw,T);hBeam(F,[sx,top,-D],[sx,top,D],tw,T);}
 // gable ends: plaster triangles in a timber frame
 for(const sx of[L,-L]){
  const g=new THREE.BufferGeometry(),A=F.at(sx,top,-D),B=F.at(sx,top,D),C=F.at(sx,top+roofH*.92,0);
  g.setAttribute('position',new THREE.Float32BufferAttribute([...A.toArray(),...B.toArray(),...C.toArray(),...A.toArray(),...C.toArray(),...B.toArray()],3));g.computeVertexNormals();HOUSE.wall.push(coloredPart(g,pick(PLASTER)));
  hBeam(F,[sx,top,0],[sx,top+roofH*.9,0],tw*.8,T);hBeam(F,[sx,top+roofH*.45,-D*.55],[sx,top+roofH*.45,D*.55],tw*.8,T);
 }
 // the roof: two slopes of staggered tile courses, an overhang all round, a ridge of capping tiles
 const over=M(.45),run=D+over,rise=roofH*(run/D),slope=Math.hypot(run,rise),pitch=Math.atan2(rise,run),K=9,tile=M(.42);
 for(const side of[1,-1])for(let k=0;k<K;k++){
  const f=(k+.5)/K,lz=side*(run*(1-f)),ly=top+roofH-rise*(1-f)+.1,n=Math.round((len+over*2)/tile);
  for(let i=0;i<n;i++){const lx=-L-over+(i+.5+(k%2)*.5)*(len+over*2)/n;if(lx>L+over)continue;
   hBox(F,'roof',lx,ly,lz,(len+over*2)/n*.94,M(.1),slope/K*1.35,pick(TILE),new THREE.Quaternion().setFromAxisAngle(new V3(1,0,0),side*pitch));}
 }
 hBox(F,'roof',0,top+roofH+M(.06),0,len+over*2,M(.16),M(.3),'#8a4430');
 // chimney of stones at one end, through the roof
 if(chimney){const cx=-chimney*(L-M(.55)),cz=-D*.3;for(let k=0;k<Math.round((roofH+M(1.3))/M(.32));k++)hBox(F,'detail',cx,top-M(.2)+k*M(.32),cz,M(.75),M(.32),M(.75),pick(['#c2bba9','#cfc8b6','#b6af9e']));
  hBox(F,'detail',cx,top-M(.2)+Math.round((roofH+M(1.3))/M(.32))*M(.32),cz,M(.85),M(.14),M(.85),'#a9a291');}
 // door on the gable end, windows with shutters on both long sides and the gable
 const dw=M(.62),dh=M(1.05);
 hBox(F,'detail',L+.06,plinth+dh/2,0,M(.12),dh,dw,'#4e3a28');for(let i=0;i<3;i++)hBox(F,'wood',L+.12,plinth+dh/2,-dw/2+(i+.5)*dw/3,M(.05),dh*.94,dw/3*.85,i%2?'#8a6844':'#7a5a3a');
 hBox(F,'wood',L+.1,plinth+dh+M(.06),0,M(.14),M(.12),dw+M(.25),T);
 const win=(lx,lz,face)=>{const ww=M(.52),wh=M(.55),y0=plinth+wallH*.62;
  if(face==='x'){hBox(F,'detail',lx,y0,lz,M(.1),wh,ww,'#2f3e3a');hBox(F,'wood',lx+Math.sign(lx)*.06,y0,lz,M(.06),wh+M(.12),M(.07),T);for(const s of[-1,1])hBox(F,'wood',lx+Math.sign(lx)*.08,y0,lz+s*(ww/2+M(.2)),M(.06),wh,M(.34),'#5f7c56');}
  else{hBox(F,'detail',lx,y0,lz,ww,wh,M(.1),'#2f3e3a');hBox(F,'wood',lx,y0,lz+Math.sign(lz)*.06,M(.07),wh+M(.12),M(.06),T);for(const s of[-1,1])hBox(F,'wood',lx+s*(ww/2+M(.2)),y0,lz+Math.sign(lz)*.08,M(.34),wh,M(.06),'#5f7c56');}};
 win(-L*.45,D+.04,'z');win(L*.45,D+.04,'z');win(-L*.3,-D-.04,'z');win(L*.3,-D-.04,'z');win(-L-.04,D*.3,'x');
 // a porch on two posts over the door
 if(porch){const pz=M(1.2);for(const s of[-1,1])hBeam(F,[L+pz,0,s*dw*1.1],[L+pz,plinth+dh+M(.35),s*dw*1.1],M(.14),T);
  for(let k=0;k<4;k++)hBox(F,'wood',L+pz*(k+.5)/4,plinth+dh+M(.55)-k*M(.1),0,pz/4*1.3,M(.07),dw*2.6,pick(['#8a6a44','#7c5e3c','#94744c']),new THREE.Quaternion().setFromAxisAngle(new V3(0,0,1),-.3));}
 // ivy on a corner, as the concept's
 for(let k=0;k<3;k++){const p=F.at(L-M(.1),plinth+wallH*R(.1,.8),D+M(.1));addBush(p.x,p.y,p.z,M(R(.25,.4)),{sy:1.2,tint:R(-.1,.1)});}
 // its footprint blocks the hero
 const c=F.at(0,0,0);COLLIDERS.push({x:c.x,z:c.z,w:len+M(.3),d:dep+M(.3),ry,box:true});
 return F;
}
// the bell tower: a square stone base, four braced timber posts, the bronze bell, a small tiled cap
let BELL=null;
function bellTower(u,v){
 const[x,y,z]=onGround(u,v),F=hFrame(x,y,z,-.25),B=M(1.7),baseH=M(1.2),postH=M(1.9),half=B/2-M(.15);
 for(let k=0;k<Math.round(baseH/M(.38));k++)for(const[sx,sz,w,d]of[[0,B/2-M(.2),B,M(.4)],[0,-B/2+M(.2),B,M(.4)],[B/2-M(.2),0,M(.4),B],[-B/2+M(.2),0,M(.4),B]])hBox(F,'detail',sx+(k%2?M(.08):0),k*M(.38)+M(.19),sz,w,M(.36),d,pick(['#c4bdaa','#d0c9b6','#b8b19f']));
 hBox(F,'detail',0,baseH-M(.1),0,B*.95,M(.2),B*.95,'#bdb6a4');
 const T='#6c5034';for(const sx of[-half,half])for(const sz of[-half,half])hBeam(F,[sx,baseH,sz],[sx,baseH+postH,sz],M(.2),T);
 for(const h of[baseH+postH*.15,baseH+postH])for(const s of[-half,half]){hBeam(F,[-half,h,s],[half,h,s],M(.16),T);hBeam(F,[s,h,-half],[s,h,half],M(.16),T);}
 for(const s of[-half,half]){hBeam(F,[-half,baseH+postH*.15,s],[half,baseH+postH*.7,s],M(.1),T);hBeam(F,[s,baseH+postH*.15,-half],[s,baseH+postH*.7,half],M(.1),T);}
 const pts=[[0,0],[.42,0],[.46,.08],[.40,.25],[.33,.6],[.30,.8],[.20,.9],[0,.92]].map(([r,h])=>new THREE.Vector2(M(r),M(h)));
 const bell=new THREE.LatheGeometry(pts,14);bell.rotateX(Math.PI);bell.translate(0,M(.92),0);
 hPart('detail',bell,'#b58c3e',F.at(0,baseH+postH*.42,0));
 hBeam(F,[-half,baseH+postH*.86,0],[half,baseH+postH*.86,0],M(.18),T);
 const cap=new THREE.ConeGeometry(B*.95,M(1.3),4);cap.rotateY(Math.PI/4);hPart('roof',cap,'#a9563a',F.at(0,baseH+postH+M(.65),0),F.q);
 BELL={x,z};COLLIDERS.push({x,z,w:B,d:B,ry:-.25,box:true});
}
// a market stall: a plank table of produce under a cloth awning on poles, a red banner by it
function stall(u,v,ry,banner=false){
 const[x,y,z]=onGround(u,v),F=hFrame(x,y,z,ry),W=M(2.2),Dp=M(1.0),T='#7a5a3a';
 hBox(F,'wood',0,M(.8),0,W,M(.1),Dp,'#9a7650');for(const sx of[-W/2+M(.1),W/2-M(.1)])for(const sz of[-Dp/2+M(.1),Dp/2-M(.1)])hBeam(F,[sx,0,sz],[sx,M(.8),sz],M(.1),T);
 for(let i=0;i<5;i++){const g=new THREE.SphereGeometry(M(.15),7,5);hPart('detail',g,pick(['#d24a3a','#e0a33a','#7aa848','#c8743a']),F.at(-W/2+M(.3)+i*W/5,M(.92),R(-.2,.2)*Dp));}
 for(let i=0;i<2;i++)hBox(F,'wood',-W/2+M(.45)+i*M(1.2),M(.98),0,M(.5),M(.22),M(.42),'#8a6a44');
 for(const sx of[-W/2,W/2]){hBeam(F,[sx,0,Dp/2+M(.5)],[sx,M(2.0),Dp/2+M(.5)],M(.08),T);hBeam(F,[sx,0,-Dp/2],[sx,M(2.3),-Dp/2],M(.08),T);}
 const aw=Math.hypot(Dp+M(.5),M(.3));hBox(F,'wall',0,M(2.15),M(.25),W+M(.3),M(.05),aw,'#ead9ae',new THREE.Quaternion().setFromAxisAngle(new V3(1,0,0),Math.atan2(M(.3),Dp+M(.5))));
 if(banner){hBeam(F,[W/2+M(.6),0,0],[W/2+M(.6),M(2.5),0],M(.09),T);hBox(F,'wall',W/2+M(.6)+M(.45),M(1.75),0,M(.85),M(1.3),M(.04),'#b04535');hBox(F,'detail',W/2+M(1.05),M(1.8),.04,M(.25),M(.35),M(.02),'#e7c25a');}
 COLLIDERS.push({x,z,r:W*.5});
}
// the vegetable garden: a post-and-rail fence round rows of cabbages and a stand of maize
function garden(u0,v0,u1,v1){
 const c=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>{const[x,,z]=onGround(u,v);return new V3(x,0,z);});
 for(let i=0;i<4;i++){const A=c[i],B=c[(i+1)%4],n=Math.max(2,Math.round(A.distanceTo(B)/M(.8)));for(let k=0;k<=n;k++){if(i===3&&k===Math.floor(n/2))continue;const p=A.clone().lerp(B,k/n),y=height(p.x,p.z);woodBox(p.x,y+M(.35),p.z,M(.1),M(.7),M(.1),'#8d7345');if(k){const q=A.clone().lerp(B,(k-1)/n),qy=height(q.x,q.z);for(const f of[.3,.6])woodBeam(new V3(q.x,qy+M(f),q.z),new V3(p.x,y+M(f),p.z),M(.05),'#a1854c');}}
  COLLIDERS.push({seg:true,x:A.x,z:A.z,x1:B.x,z1:B.z,r:M(.06)});}
 // soil, cabbage rows and maize
 const soil=new THREE.BufferGeometry(),y=height(c[0].x,c[0].z)+.05;soil.setAttribute('position',new THREE.Float32BufferAttribute([c[0],c[1],c[2],c[0],c[2],c[3]].flatMap(p=>[p.x,height(p.x,p.z)+.06,p.z]),3));soil.computeVertexNormals();
 const sm=new THREE.Mesh(soil,paint({color:'#8a6a44',side:THREE.DoubleSide,shade:[.57,.48,.37],mid:[.83,.69,.50]}));sm.receiveShadow=true;scene.add(sm);
 for(let r=0;r<4;r++)for(let k=0;k<6;k++){const p=c[0].clone().lerp(c[1],(k+.5)/6).lerp(c[3].clone().lerp(c[2],(k+.5)/6),(r+.6)/5.2),py=height(p.x,p.z);
  if(r===0){for(let s=0;s<3;s++){const h=M(R(1.2,1.6)),bx=p.x+R(-.4,.4),bz=p.z+R(-.4,.4),g=new THREE.CylinderGeometry(M(.025),M(.04),h,4);hPart('detail',g,'#6f8f34',new V3(bx,py+h/2,bz));for(let l=0;l<4;l++){const lg=new THREE.BoxGeometry(M(.55),M(.02),M(.09));hPart('detail',lg,pick(['#5f8a30','#76a03c']),new V3(bx,py+h*(.3+l*.15),bz),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,R(0,6.28),R(-.5,-.2))));}hPart('detail',new THREE.ConeGeometry(M(.06),M(.3),4),'#d8c46a',new V3(bx,py+h+M(.12),bz));}continue;}
  const g=new THREE.SphereGeometry(M(R(.22,.3)),8,6);g.scale(1,.75,1);hPart('detail',g,pick(['#7fb24e','#6aa044','#94c25e']),new V3(p.x,py+M(.15),p.z));}
}
// a bench of planks on two legs
function bench(x,z,ry){const F=hFrame(x,height(x,z),z,ry);hBox(F,'wood',0,M(.45),0,M(1.6),M(.1),M(.45),'#94714a');for(const s of[-1,1])hBox(F,'wood',s*M(.6),M(.22),0,M(.12),M(.44),M(.4),'#6e5236');COLLIDERS.push({x,z,r:M(.7)});}
function finishHouses(){
 const mats={wall:paint({vertexColors:true,side:THREE.DoubleSide,shade:[.61,.57,.48],mid:[.89,.84,.72],band:[-.2,.28]}),wood:paint({vertexColors:true,shade:[.54,.48,.40],mid:[.83,.72,.55],band:[-.2,.30]}),roof:paint({vertexColors:true,shade:[.52,.43,.36],mid:[.84,.68,.52],band:[-.2,.30]}),detail:paint({vertexColors:true,shade:[.55,.53,.47],mid:[.85,.80,.69]})};
 for(const[k,arr]of Object.entries(HOUSE))if(arr.length){const m=new THREE.Mesh(mergeGeometries(arr),mats[k]);m.castShadow=m.receiveShadow=true;scene.add(m);}
}
