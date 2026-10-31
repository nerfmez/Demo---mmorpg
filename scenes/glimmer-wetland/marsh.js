// Original pieces for Glimmer Wetland: great weeping willows with gnarled trunks and flaring roots,
// mossy stone blocks round the pools, lily pads, white-plumed reeds, pebbles under the clear water,
// the glowing crystal on its rock and the glints that twinkle over the water. Shared helpers from
// Mirror Pond: coloured parts, bark-style trunks and roots, tapered strands.
let CRYSTAL=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
function taperedTube(pts,r0,r1,segments=14,sides=6){
 const curve=new THREE.CatmullRomCurve3(pts),g=new THREE.TubeGeometry(curve,segments,1,sides,false),p=g.attributes.position,ring=sides+1;
 for(let i=0;i<p.count;i++){const t=Math.floor(i/ring)/segments,q=curve.getPoint(t),r=r1+(r0-r1)*Math.pow(1-t,1.4);p.setXYZ(i,q.x+(p.getX(i)-q.x)*r,q.y+(p.getY(i)-q.y)*r,q.z+(p.getZ(i)-q.z)*r);}
 g.computeVertexNormals();return g;
}
// Bark in the game trunk's own style (render/anime-study.js animeTrunk): nine flat facets round
// a curve, each toned light, mid or shadow by the sun, so roots and willow trunks match the trees.
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
// the game trunk's radius (tree units) at height h, from its authored spine
function trunkRadius(h){const sp=ANIME.trunk.spine;for(let i=1;i<sp.length;i++)if(h<=sp[i][1]){const t=(h-sp[i-1][1])/(sp[i][1]-sp[i-1][1]);return sp[i-1][3]+(sp[i][3]-sp[i-1][3])*t;}return sp.at(-1)[3];}
// A root grows out of the trunk's side: it leaves the bark at height hs, curves down onto the
// ground within a short flare and runs on over it, half buried at its end.
function rootPath(x,z,y0,s,a,hs,len,wobble){
 const pts=[],n=11,rt=trunkRadius(hs)*s,r0=trunkRadius(0)*s;
 pts.push(new V3(x+Math.cos(a)*rt*.35,y0+hs*s,z+Math.sin(a)*rt*.35));
 for(let j=1;j<=n;j++){
  const t=j/n,r=r0*.85+len*t,aa=a+Math.sin(t*2.6+wobble)*.3*t,px=x+Math.cos(aa)*r,pz=z+Math.sin(aa)*r;
  const ground=Math.max(height(px,pz),SEA_Y-.15),rise=hs*s*.85*Math.pow(1-smooth(0,.28,t),1.6),sink=M(.04)*smooth(.55,1,t);
  pts.push(new V3(px,ground+rise+M(.02)-sink,pz));
  // a root that reaches the pond ends just past the waterline, dipping in
  if(j>=2&&pondIn(px,pz)>M(.2)){pts.at(-1).y=SEA_Y-M(.1);break;}
 }
 return pts;
}
// Old trees whose roots flare from the trunk as buttresses, run half buried over the ground and
// fork, as the region concept's; toward the pond they run on to the water.
const rootParts=[];
// old trees whose roots flare from the trunk, run half buried over the ground and fork; a root that
// reaches a pool runs on just past its waterline
function rootTree(u,v,s,seed){
 const[x,y,z]=onGround(u,v);broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.38});
 const y0=y-.05,n=6+Math.floor(rand()*3),start=R(0,Math.PI*2);
 for(let k=0;k<n;k++){
  const a=start+k/n*Math.PI*2+R(-.3,.3),hs=R(.22,.4),len=s*R(1.1,1.9),thick=trunkRadius(hs)*s*R(.6,.72),pts=rootPath(x,z,y0,s,a,hs,len,R(0,6));
  rootParts.push(barkTube(pts,thick,thick*.12,20));
 }
}
// A great weeping willow, the concept's: a thick gnarled trunk of two or three twisting stems, big
// buttress roots spreading over the ground (into the water where a pool is near), boughs reaching up
// and out, and from the bough ends long curtains of hanging strands, no leafy dome.
function willow(u,v,s,strands=1300){
 const[x,y,z]=onGround(u,v),parts=[],H=M(1.55)*s,Rc=M(2.1)*s;
 const lean=R(0,Math.PI*2);
 for(let k=0;k<3;k++){
  const a=lean+k*2.1+R(-.3,.3),o=M(.16)*s,tw=R(-.6,.6);
  rootParts.push(barkTube([new V3(x+Math.cos(a)*o,y-.1,z+Math.sin(a)*o),new V3(x+Math.cos(a+tw)*o*1.4,y+H*.35,z+Math.sin(a+tw)*o*1.4),new V3(x+Math.cos(a-tw)*o*.8+Math.cos(lean)*M(.2),y+H*.7,z+Math.sin(a-tw)*o*.8+Math.sin(lean)*M(.2)),new V3(x+Math.cos(lean)*M(.25),y+H,z+Math.sin(lean)*M(.25))],M(.26)*s,M(.12)*s,12));
 }
 // big buttress roots at its foot, forking, as the concept's
 for(let k=0;k<7;k++){
  const a=k/7*Math.PI*2+R(-.3,.3),pts=rootPath(x,z,y-.05,s*2.2,a,R(.25,.4),M(R(1.0,1.8))*s,R(0,6));
  rootParts.push(barkTube(pts,M(.2)*s,M(.02),16));
  if(rand()<.6){const i0=Math.round(pts.length*R(.4,.6)),o=pts[Math.min(pts.length-1,i0)],b=a+(rand()<.5?-1:1)*R(.5,.9),bl=M(R(.5,.9))*s,bp=[o.clone()];
   for(let j=1;j<=5;j++){const t=j/5,px=o.x+Math.cos(b)*bl*t,pz=o.z+Math.sin(b)*bl*t;if(pondIn(px,pz)>M(.2))break;bp.push(new V3(px,Math.max(height(px,pz),SEA_Y-.15)+M(.02)-M(.04)*t,pz));}
   if(bp.length>2)rootParts.push(barkTube(bp,M(.09)*s,M(.015),10));}
 }
 const cy=y+H+Rc*.3;
 // boughs reach up into the crown to carry the strands
 for(let k=0;k<8;k++){const a=k/8*Math.PI*2+R(-.3,.3),r=Rc*R(.4,.75),pts=[new V3(x+Math.cos(lean)*M(.2),y+H*.85,z+Math.sin(lean)*M(.2)),new V3(x+Math.cos(a)*r*.45,cy+Rc*.08,z+Math.sin(a)*r*.45),new V3(x+Math.cos(a)*r,cy+Rc*.2,z+Math.sin(a)*r*.9)];rootParts.push(barkTube(pts,M(.11)*s,M(.03)*s,8));}
 const LEAF=['#7fb94e','#94c95a','#a9d665','#6ea845','#bfe07a','#c9e486'];
 for(let i=0;i<strands;i++){
  const a=R(0,Math.PI*2),f=Math.sqrt(R(0,1)),rr=Rc*f,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr*.9,top=cy+Rc*.32*(1-f*f)+R(-.15,.15);
  const L=Math.max(.6,Math.min(top-Math.max(height(px,pz),SEA_Y)-.4,M(R(.8,1.7))*s*(.35+.85*f))),out=M(R(.15,.35))*(.3+f);
  const pts=[new V3(px-Math.cos(a)*out*.5,top-.2,pz-Math.sin(a)*out*.5),new V3(px,top+.08,pz),new V3(px+Math.cos(a)*out*.8,top-L*.3,pz+Math.sin(a)*out*.8),new V3(px+Math.cos(a)*out,top-L*.7,pz+Math.sin(a)*out),new V3(px+Math.cos(a)*out*1.05,top-L,pz+Math.sin(a)*out*1.05)];
  parts.push(coloredPart(taperedTube(pts,M(.036),M(.009),6,3),pick(LEAF)));
 }
 const leaf=new THREE.Mesh(mergeGeometries(parts),paint({vertexColors:true,shade:[.5,.64,.5],mid:[.84,.93,.8]}));leaf.castShadow=true;scene.add(leaf);
 COLLIDERS.push({x,z,r:M(.45)*s});
}
// mossy stone blocks set round each pool's edge, broken where the paths meet it, as the concept's
const SHORE_STONE=['#c9c4bd','#bdb8b2','#d1cbc3','#b4afaa'];
function shoreBlocks(){
 for(const P0 of POOLS){
  const n=Math.round(poolRadius(P0,0)*2*Math.PI/M(1.1));
  for(let i=0;i<n;i++){
   const a=-Math.PI+(i+R(-.2,.2))/n*2*Math.PI,r=poolRadius(P0,a)+M(.2),x=P0.cx+Math.cos(a)*r,z=P0.cz+Math.sin(a)*r;
   const st=stairsAt(x,z);if(st.s<st.half+M(.35)||field(x,z).rock>.3||rand()<.3)continue;
   const w=M(R(.5,.85)),h=M(R(.3,.55)),y=Math.min(height(x,z),M(.1));
   block(x,y-M(.25),z,w,h+M(.2),w*R(.65,.9),-a+R(-.3,.3),.6,{base:pick(SHORE_STONE)});
   COLLIDERS.push({x,z,r:w*.42});
   if(rand()<.45)addBush(x+R(-.3,.3),y+h-M(.2),z+R(-.3,.3),M(R(.2,.34)),{sy:.6,tint:R(-.15,.2)});
  }
 }
}
// pebbles on the pools' floors, seen through the clear water
function poolPebbles(){
 for(let i=0;i<900;i++){
  const P0=pick(POOLS),a=R(-Math.PI,Math.PI),r=poolRadius(P0,a)*Math.sqrt(R(0,.9)),x=P0.cx+Math.cos(a)*r,z=P0.cz+Math.sin(a)*r;
  if(pondIn(x,z)<M(.3))continue;
  const s=R(.15,.55);addStone(x,height(x,z)-.05,z,s*1.5,s*.7,s*1.2,{extra:5,chamfer:.3,noLine:true,moss:.25,base:pick(['#8a8f86','#9a9a8e','#7d857e','#a3a094'])});
 }
}
const lilyItems=[];
function lilyPads(){
 // pads drift in the shallows along the edges, a few in white flower
 for(let i=0;i<420;i++){
  const P0=pick(POOLS),a=R(-Math.PI,Math.PI),r=poolRadius(P0,a)-M(R(.25,2.2)),x=P0.cx+Math.cos(a)*r,z=P0.cz+Math.sin(a)*r;
  if(pondIn(x,z)<.4)continue;
  lilyItems.push({x,z,s:R(.3,.6),ry:R(0,6.28),flower:rand()<.1});
 }
 const pad=new THREE.CircleGeometry(1,9,.35,Math.PI*2-.7);pad.rotateX(-Math.PI/2);
 const pads=new THREE.InstancedMesh(pad,paint({color:'#5fa95a',shade:[.55,.62,.6],mid:[.85,.92,.88]}),lilyItems.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color();
 lilyItems.forEach((l,i)=>{m.compose(new V3(l.x,SEA_Y+.06,l.z),q.setFromAxisAngle(new V3(0,1,0),l.ry),new V3(l.s,1,l.s));pads.setMatrixAt(i,m);pads.setColorAt(i,c.set(pick(['#5fa95a','#72b862','#4c9852','#8cc66a'])));});
 pads.receiveShadow=true;pads.renderOrder=3;scene.add(pads);
 const fl=lilyItems.filter(l=>l.flower),bloom=new THREE.ConeGeometry(.17,.15,6);bloom.translate(0,.075,0);
 const blooms=new THREE.InstancedMesh(bloom,paint({color:'#fbf7ee',shade:[.75,.78,.82],mid:[.95,.95,.95]}),fl.length);
 fl.forEach((l,i)=>{m.compose(new V3(l.x+.1,SEA_Y+.08,l.z),q.identity(),new V3(1,1,1));blooms.setMatrixAt(i,m);});
 blooms.renderOrder=3;scene.add(blooms);
}
// reeds: clumps of tall blades with white plumes, at the pools' edges and in the damp grass
const reedParts=[];
function reedClump(x,z,s){
 const y=Math.max(height(x,z),SEA_Y)-.05,n=6+Math.floor(rand()*5);
 for(let k=0;k<n;k++){
  const a=R(0,6.28),r=R(0,.35)*s,bx=x+Math.cos(a)*r,bz=z+Math.sin(a)*r,h=M(R(.7,1.15))*s,la=R(0,6.28),lean=R(.05,.25)*h;
  reedParts.push(coloredPart(taperedTube([new V3(bx,y,bz),new V3(bx+Math.cos(la)*lean*.3,y+h*.5,bz+Math.sin(la)*lean*.3),new V3(bx+Math.cos(la)*lean,y+h,bz+Math.sin(la)*lean)],M(.045)*s,M(.008),5,3),pick(['#5d9a43','#78b04c','#4c8a3c','#8fc059'])));
  if(k<3&&rand()<.85){
   // a plume on its own stem, standing above the blades
   const ph=h*R(1.05,1.25),tx=bx+Math.cos(la)*lean*.6,tz=bz+Math.sin(la)*lean*.6;
   reedParts.push(coloredPart(taperedTube([new V3(bx,y,bz),new V3(tx,y+ph,tz)],M(.02),M(.012),3,3),'#7da455'));
   const g=new THREE.SphereGeometry(1,6,5);g.scale(M(.07)*s,M(.24)*s,M(.07)*s);
   reedParts.push(coloredPart(g,pick(['#f6efdc','#efe5cc','#fbf6e8']),new THREE.Matrix4().makeTranslation(tx,y+ph+M(.18)*s,tz)));
  }
 }
}
function reeds(){
 for(let i=0;i<260;i++){
  const P0=pick(POOLS),a=R(-Math.PI,Math.PI),r=poolRadius(P0,a)+M(R(-.6,.5)),x=P0.cx+Math.cos(a)*r,z=P0.cz+Math.sin(a)*r;
  if(stairsAt(x,z).s<stairsAt(x,z).half+M(.6)||rand()<.55)continue;
  reedClump(x,z,R(.8,1.15));
 }
 if(reedParts.length){const m=new THREE.Mesh(mergeGeometries(reedParts),paint({vertexColors:true,shade:[.55,.62,.55],mid:[.86,.92,.84],sway:[.03,0]}));m.castShadow=true;scene.add(m);}
}
// the crystal on its rock: a cluster of glassy hexagonal prisms with pointed tips, glowing cyan
function crystal(u,v){
 const[x,y,z]=onGround(u,v),parts=[];
 CRYSTAL={x,y,z};
 for(const[dx,dz,h,r,tx,tz]of[[0,0,2.4,.32,0,0],[.35,.1,1.5,.22,.25,.1],[-.3,.2,1.3,.2,-.25,.12],[.1,-.3,1.1,.18,.08,-.25],[-.15,-.25,.8,.15,-.2,-.2],[.4,-.2,.7,.13,.3,-.18]]){
  const g=new THREE.CylinderGeometry(M(r),M(r)*1.05,M(h),6),tip=new THREE.ConeGeometry(M(r),M(r)*2.2,6);tip.translate(0,M(h)/2+M(r)*1.1,0);
  for(const[pg,col]of[[g,pick(['#5fd6e0','#7ee6e8','#49c2d8'])],[tip,'#c8fbf8']]){
   const m=new THREE.Matrix4().compose(new V3(x+M(dx),y+M(h)/2-M(.1),z+M(dz)),new THREE.Quaternion().setFromEuler(new THREE.Euler(tz,R(0,1),-tx)),new V3(1,1,1));
   parts.push(coloredPart(pg,col,m));
  }
 }
 const mesh=new THREE.Mesh(mergeGeometries(parts),paint({vertexColors:true,shade:[.62,.8,.92],mid:[.85,.95,1.05],lit:[1.15,1.2,1.25]}));mesh.castShadow=true;scene.add(mesh);
 for(let k=0;k<6;k++){const a=k/6*6.28;block(x+Math.cos(a)*M(.75),y-M(.2),z+Math.sin(a)*M(.6),M(R(.45,.7)),M(R(.3,.5)),M(R(.4,.6)),R(0,3),.7,{base:pick(SHORE_STONE)});}
 COLLIDERS.push({x,z,r:M(.9)});
}
// glints: little four-point stars twinkling over the water and round the crystal
const glints=[];
function sparkles(){
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
 const grad=g.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.25,'rgba(200,255,250,.6)');grad.addColorStop(1,'rgba(160,240,255,0)');
 g.fillStyle=grad;g.fillRect(0,0,64,64);g.fillStyle='rgba(255,255,255,.95)';
 for(const[w,h]of[[3,30],[30,3]]){g.beginPath();g.ellipse(32,32,w,h,0,0,Math.PI*2);g.fill();}
 const tex=new THREE.CanvasTexture(c);
 const spots=[];
 for(let i=0;i<40;i++){const P0=pick(POOLS),a=R(-Math.PI,Math.PI),r=poolRadius(P0,a)*Math.sqrt(R(0,.8));spots.push([P0.cx+Math.cos(a)*r,SEA_Y+R(.15,.5),P0.cz+Math.sin(a)*r,R(.6,1.1)]);}
 if(CRYSTAL)for(let i=0;i<8;i++)spots.push([CRYSTAL.x+R(-1,1)*M(.8),CRYSTAL.y+M(R(.6,2.6)),CRYSTAL.z+R(-1,1)*M(.6),R(.7,1.2)]);
 for(const[x,y,z,s]of spots){const m=new THREE.SpriteMaterial({map:tex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,color:'#dffcff'}),sp=new THREE.Sprite(m);sp.position.set(x,y,z);sp.scale.setScalar(s);sp.renderOrder=5;scene.add(sp);glints.push({sp,s,ph:R(0,6.28),rate:R(.6,1.4)});}
}
