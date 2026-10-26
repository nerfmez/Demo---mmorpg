// Original pieces for Mirror Pond: the moon gate on the high ground behind the pond, stepping
// stones across the water to the rim stair, mossy blocks round the shore, lily pads, weeping
// willows and old trees whose roots spill over the rim, and Moonroot's glowing plants.
let MOON=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const MOON_STONE=['#c9cfc9','#bec5c0','#d3d8d2','#b5bdb8'];
function moonGate(){
 // a ring of dressed stones standing on two round steps, a pale stone disc within it
 const[x,z]=P(.475,.135,PL),y=height(x,z)-.12,R0=wide(.443,.507,.075,PL)/2,ring=R0*.2,cy=tall(x,z,y,.075)+y;
 const group=new THREE.Group(),parts=[];
 for(const[r,h,c]of[[R0*.95,M(.14),'#a9b2ad'],[R0*.78,M(.12),'#b4bcb6']]){
  const yy=parts.length?y+M(.16):y;parts.push(coloredPart(new THREE.CylinderGeometry(r,r*1.04,h,14),c,new THREE.Matrix4().makeTranslation(x,yy+h/2,z)));
 }
 const base=y+M(.26),cyc=base+R0+ring*.2,n=14,ry=0;
 for(let i=0;i<n;i++){
  const a=(i+.5)/n*Math.PI*2,mx=Math.sin(a)*(R0-ring/2),my=Math.cos(a)*(R0-ring/2);
  const seg=2*Math.PI*(R0-ring/2)/n;
  block(x+mx,cyc+my-ring*.42,z,seg*1.02,ring*.84,ring*.95,ry,i>n*.6||i<n*.25?.35:.15,{base:pick(MOON_STONE),rz:-a});
 }
 // the disc: a pale stone face with a crescent of moon-glass
 const disc=new THREE.CircleGeometry(R0-ring*.9,28);disc.translate(x,cyc,z-.05);
 parts.push(coloredPart(disc,'#d9e1dc'));
 const mat=paint({vertexColors:true,shade:[.62,.66,.68],mid:[.9,.93,.92]});
 const mesh=new THREE.Mesh(mergeGeometries(parts),mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
 const crescent=new THREE.RingGeometry((R0-ring)*.45,(R0-ring)*.62,24,1,Math.PI*.15,Math.PI*1.25);crescent.translate(x,cyc,z+.0);
 const glow=new THREE.Mesh(crescent,new THREE.MeshBasicMaterial({color:'#9ff0e6',transparent:true,opacity:.85}));glow.position.z=-.02;group.add(glow);
 COLLIDERS.push({x,z,r:R0*1.1});
 MOON={x,z,y,r:R0,group};
 return group;
}
// stepping stones across the pond from the plaza to the rim stair, [u, v on the water]
const STEP_STONES=[[.522,.535],[.507,.49],[.516,.445],[.498,.40],[.49,.355],[.482,.312]].map(([u,v],i)=>{const[x,z]=P(u,v,SEA_Y);return{x,z,r:M(.42+.04*Math.sin(i*2.1)),top:SEA_Y+M(.32)};});
function onStone(x,z){return STEP_STONES.some(s=>Math.hypot(x-s.x,z-s.z)<s.r*.92);}
function walkY(x,z){let y=height(x,z);for(const s of STEP_STONES)if(Math.hypot(x-s.x,z-s.z)<s.r)y=Math.max(y,s.top);return y;}
function steppingStones(){
 for(const s of STEP_STONES){
  const h=s.top-SEA_FLOOR+.1,g=new THREE.CylinderGeometry(s.r,s.r*1.12,h,7);
  g.rotateY(R(0,1));const m=new THREE.Matrix4().makeTranslation(s.x,SEA_FLOOR-.1+h/2,s.z);
  stoneParts.push(coloredPart(g,pick(['#b8bfba','#c4cac4','#aeb6b1']),m));
  // moss on the waterline
  addBush(s.x+s.r*.7,SEA_Y+.1,s.z+s.r*.3,s.r*.35,{sy:.4,tint:R(-.2,.1)});
 }
}
function shoreStones(){
 // square mossy blocks set round the water's edge, broken where the paths and stones meet it
 const n=64;
 for(let i=0;i<n;i++){
  const a=-Math.PI+(i+R(-.2,.2))/n*2*Math.PI,r=pondRadius(a)+M(.15),x=POND.cx+Math.cos(a)*r,z=POND.cz+Math.sin(a)*r;
  const st=stairsAt(x,z);if(st.s<st.half+M(.5))continue;
  if(Math.hypot(x-STEP_STONES[0].x,z-STEP_STONES[0].z)<M(1.4))continue;
  const f=field(x,z);if(f.top>.5)continue;   // the rim's own rock face stands here
  if(rand()<.22)continue;
  const w=M(R(.45,.75)),h=M(R(.35,.6)),y=Math.min(height(x,z),SEA_Y+M(.2));
  block(x,y-M(.25),z,w,h+M(.2),w*R(.7,.95),-a+R(-.3,.3),.55,{base:pick(MOON_STONE)});
  COLLIDERS.push({x,z,r:w*.42});
  if(rand()<.5)addBush(x+R(-.3,.3),y+h-M(.2),z+R(-.3,.3),M(R(.22,.36)),{sy:.6,tint:R(-.15,.2)});
 }
 // the rocky islet on the right of the water, as the reference's
 const[ix,iz]=P(.62,.395,SEA_Y);
 for(const[dx,dz,w,h]of[[0,0,.9,.75],[.9,.2,.7,.55],[-.8,.3,.6,.5],[.2,-.7,.55,.6],[1.4,-.4,.5,.4]]){const x=ix+M(dx),z=iz+M(dz);block(x,SEA_FLOOR,z,M(w),SEA_Y-SEA_FLOOR+M(h),M(w)*.85,R(-.5,.5),.6,{base:pick(MOON_STONE)});}
 addBush(ix,SEA_Y+M(.55),iz,M(.45),{sy:.55});addBush(ix+M(.8),SEA_Y+M(.4),iz+M(.2),M(.35),{sy:.5});
}
const lilyItems=[];
function lilyPads(){
 // pads drift in the shallows along the edges, a few in flower
 for(let i=0;i<220;i++){
  const a=R(-Math.PI,Math.PI),r=pondRadius(a)-M(R(.25,1.6)),x=POND.cx+Math.cos(a)*r,z=POND.cz+Math.sin(a)*r;
  if(STEP_STONES.some(s=>Math.hypot(x-s.x,z-s.z)<s.r+.5)||pondIn(x,z)<.4)continue;
  lilyItems.push({x,z,s:R(.28,.55),ry:R(0,6.28),flower:rand()<.12});
 }
 const pad=new THREE.CircleGeometry(1,9,.35,Math.PI*2-.7);pad.rotateX(-Math.PI/2);
 const pads=new THREE.InstancedMesh(pad,paint({color:'#4f9a62',shade:[.55,.62,.6],mid:[.85,.92,.88]}),lilyItems.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color();
 lilyItems.forEach((l,i)=>{m.compose(new V3(l.x,SEA_Y+.06,l.z),q.setFromAxisAngle(new V3(0,1,0),l.ry),new V3(l.s,1,l.s));pads.setMatrixAt(i,m);pads.setColorAt(i,c.set(pick(['#4f9a62','#5fa86a','#3f8a5c'])));});
 pads.receiveShadow=true;pads.renderOrder=3;scene.add(pads);
 const fl=lilyItems.filter(l=>l.flower),bloom=new THREE.ConeGeometry(.16,.14,6);bloom.translate(0,.07,0);
 const blooms=new THREE.InstancedMesh(bloom,paint({color:'#f6f3ec',shade:[.75,.78,.82],mid:[.95,.95,.95]}),fl.length);
 fl.forEach((l,i)=>{m.compose(new V3(l.x+.1,SEA_Y+.08,l.z),q.identity(),new V3(1,1,1));blooms.setMatrixAt(i,m);});
 blooms.renderOrder=3;scene.add(blooms);
}
// a weeping willow: a leaning trunk, then curtains of hanging strands from a domed crown
function willow(u,v,s){
 const[x,y,z]=onGround(u,v),parts=[],bark=[],H=M(2.4)*s,Rc=M(1.7)*s;
 const tr=new THREE.CylinderGeometry(M(.12)*s,M(.24)*s,H,8);tr.translate(x,y+H/2,z);bark.push(coloredPart(tr,'#8c7258'));
 for(let k=0;k<4;k++){const a=k*1.7+R(-.3,.3),b=new THREE.CylinderGeometry(M(.05)*s,M(.09)*s,Rc*1.1,6);b.translate(0,Rc*.55,0);b.rotateZ(.9);b.rotateY(a);b.translate(x,y+H*.85,z);bark.push(coloredPart(b,'#856b52'));}
 const cy=y+H+Rc*.35;
 // no leafy dome (owner): the crown is only strands. They spring from the branch ends over the
 // whole crown, arch up and out a little and fall in long curtains, the outer ones longest.
 const LEAF=['#6aa95e','#7fbb68','#95c972','#5a9a58','#a9d27e','#b8da86'];
 for(let i=0;i<1100;i++){
  const a=R(0,Math.PI*2),f=Math.sqrt(R(0,1)),rr=Rc*f,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr*.9,top=cy+Rc*.3*(1-f*f)+R(-.15,.15);
  const L=Math.max(.6,Math.min(top-height(px,pz)-.3,M(R(.7,1.5))*s*(.35+.85*f))),out=M(R(.15,.35))*(.3+f);
  const pts=[new V3(px-Math.cos(a)*out*.5,top-.2,pz-Math.sin(a)*out*.5),new V3(px,top+.08,pz),new V3(px+Math.cos(a)*out*.8,top-L*.3,pz+Math.sin(a)*out*.8),new V3(px+Math.cos(a)*out,top-L*.7,pz+Math.sin(a)*out),new V3(px+Math.cos(a)*out*1.05,top-L,pz+Math.sin(a)*out*1.05)];
  parts.push(coloredPart(taperedTube(pts,M(.032),M(.008),6,3),pick(LEAF)));
 }
 // branches reach up into the crown to carry them
 for(let k=0;k<7;k++){const a=k/7*Math.PI*2+R(-.3,.3),r=Rc*R(.35,.7),pts=[new V3(x,y+H*.8,z),new V3(x+Math.cos(a)*r*.45,cy+Rc*.05,z+Math.sin(a)*r*.45),new V3(x+Math.cos(a)*r,cy+Rc*.18,z+Math.sin(a)*r*.9)];bark.push(coloredPart(taperedTube(pts,M(.09)*s,M(.025)*s,8,5),'#856b52'));}
 const leaf=new THREE.Mesh(mergeGeometries(parts),paint({vertexColors:true,shade:[.52,.66,.62],mid:[.86,.95,.88]}));leaf.castShadow=true;scene.add(leaf);
 const trunk=new THREE.Mesh(mergeGeometries(bark),paint({vertexColors:true,shade:[.55,.5,.5],mid:[.86,.8,.74]}));trunk.castShadow=trunk.receiveShadow=true;scene.add(trunk);
 COLLIDERS.push({x,z,r:M(.3)*s});
}
// A tube along points whose radius falls from r0 to r1 (faster toward the tip).
function taperedTube(pts,r0,r1,segments=14,sides=6){
 const curve=new THREE.CatmullRomCurve3(pts),g=new THREE.TubeGeometry(curve,segments,1,sides,false),p=g.attributes.position,ring=sides+1;
 for(let i=0;i<p.count;i++){const t=Math.floor(i/ring)/segments,q=curve.getPoint(t),r=r1+(r0-r1)*Math.pow(1-t,1.4);p.setXYZ(i,q.x+(p.getX(i)-q.x)*r,q.y+(p.getY(i)-q.y)*r,q.z+(p.getZ(i)-q.z)*r);}
 g.computeVertexNormals();return g;
}
// Old trees whose roots flare from the trunk as buttresses, dive into the soil, wander over it
// half buried and fork, as the region concept's; toward the pond the roots run on over the rim
// and down its face to the water.
const rootParts=[];
const ROOT_BARK=['#96705b','#8a6650','#a07a62'];
function rootPath(x,z,y0,a,len,lift,r0,wobble){
 const pts=[],n=10;
 for(let j=0;j<=n;j++){
  const t=j/n,r=r0+len*t,aa=a+Math.sin(t*2.6+wobble)*.32*t,px=x+Math.cos(aa)*r,pz=z+Math.sin(aa)*r;
  const ground=Math.max(height(px,pz),SEA_Y-.15),rise=lift*Math.pow(1-smooth(0,.3,t),1.6),sink=M(.05)*smooth(.55,1,t);
  pts.push(new V3(px,j===0?y0+lift:ground+rise+M(.035)-sink,pz));
  // a root that reaches the pond ends just past the waterline, dipping in
  if(j>=2&&pondIn(px,pz)>M(.2)){pts.at(-1).y=SEA_Y-M(.1);break;}
 }
 return pts;
}
function rootTree(u,v,s,seed,toPond=false){
 const[x,y,z]=onGround(u,v),spill=toPond?Math.atan2(POND.cz-z,POND.cx-x):null;broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.38});
 const n=5+Math.floor(rand()*3),start=R(0,Math.PI*2);
 for(let k=0;k<n;k++){
  const a=start+k/n*Math.PI*2+R(-.35,.35),toward=spill!==null&&Math.cos(a-spill)>.55,len=M(R(1.0,1.7))*s*(toward?2.2:1),thick=M(R(.11,.15))*s;
  const pts=rootPath(x,z,y,a,len,M(R(.16,.26))*s,M(.1)*s,R(0,6));
  rootParts.push(coloredPart(taperedTube(pts,thick,M(.022),18,7),pick(ROOT_BARK)));
  // a fork or two off the main root, thinner, turning away from it
  for(let f=0;f<(rand()<.6?2:1);f++){
   const t0=R(.3,.6),i0=Math.min(pts.length-2,Math.round(t0*10)),o=pts[i0],side=rand()<.5?-1:1,b=a+side*R(.45,.9),bl=len*R(.35,.55);
   const bp=[o.clone()];for(let j=1;j<=6;j++){const t=j/6,px=o.x+Math.cos(b)*bl*t,pz=o.z+Math.sin(b)*bl*t;if(pondIn(px,pz)>0)break;bp.push(new V3(px,Math.max(height(px,pz),SEA_Y-.15)+M(.03)-M(.04)*t,pz));}
   if(bp.length<3)continue;
   rootParts.push(coloredPart(taperedTube(bp,thick*(1-t0)*.7,M(.01),10,6),pick(ROOT_BARK)));
  }
 }
}
// Moonroot's glow: little cyan bell-flowers and curled white sprouts in the shade
const glowItems=[];
function glowPlants(){
 for(let i=0;i<900;i++){
  const[x,y,z]=onGround(R(-.05,1.05),R(-.05,1.0));
  if(trailEdge(x,z)<M(.5)||pondIn(x,z)>-M(.3)||field(x,z).rock>.2||shadeAt(x,z)<.25&&rand()<.7)continue;
  glowItems.push({x,y,z,s:R(.7,1.2),c:rand()<.55?'#8ff2e4':'#f2fbf2'});
 }
 const g=new THREE.SphereGeometry(.09,6,4);g.translate(0,.22,0);
 const stem=new THREE.CylinderGeometry(.012,.016,.22,3);stem.translate(0,.11,0);
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),col=new THREE.Color();
 const bulbs=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:'#ffffff'}),glowItems.length),stems=new THREE.InstancedMesh(stem,paint({color:'#4f8a5e'}),glowItems.length);
 glowItems.forEach((it,i)=>{m.compose(new V3(it.x,it.y-.02,it.z),q.setFromAxisAngle(new V3(0,1,0),R(0,6)),new V3(it.s,it.s,it.s));bulbs.setMatrixAt(i,m);stems.setMatrixAt(i,m);bulbs.setColorAt(i,col.set(it.c));});
 scene.add(bulbs,stems);
}
