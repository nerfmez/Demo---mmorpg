// Original pieces for the Old Root Stone Ring: a ring of tall weathered standing stones on the
// mound, a paved circle round a low moon altar (a broken drum with a crescent carved in its face),
// mossy blocks along the mound's face, great old trees whose roots spill over the mound (the region
// concept's ring round a giant tree) and Moonroot's glowing plants.
let ALTAR=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const MOON_STONE=['#c9cfc9','#bec5c0','#d3d8d2','#b5bdb8'];
const ringParts=[];
function pavedCircle(cx,cz,r0,r1){
 // concentric courses of flat slabs, each course offset, grass in the gaps
 for(let ring=0,r=r0;r<r1;ring++,r+=M(.42)){
  const n=Math.max(6,Math.round(2*Math.PI*r/M(.6)));
  for(let i=0;i<n;i++){const a=(i+(ring%2)*.5)/n*Math.PI*2,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;if(rand()<.08)continue;
   block(x,height(x,z)-.1,z,2*Math.PI*r/n*.9,M(.1),M(.38),-a+Math.PI/2+R(-.05,.05),.12,{base:pick(['#c9c3ba','#bfb9b0','#d1cbc1','#c4c9c2'])});}
 }
}
function moonAltar(u,v){
 // a low drum of dressed stone, its front broken open, a crescent carved in its face
 const[x,z]=P(u,v,PL),y=height(x,z),R0=wide(u-.055,u+.055,v,PL)/2,H=M(.55),n=14;
 for(let i=0;i<n;i++){const a=(i+.5)/n*Math.PI*2;if(Math.sin(a)>.75&&Math.abs(Math.cos(a))<.35)continue;
  block(x+Math.cos(a)*R0*.85,y-.05,z+Math.sin(a)*R0*.85,2*Math.PI*R0*.85/n*1.02,H*(Math.sin(a)>.2?.8:1),R0*.32,-a+Math.PI/2,.35,{base:pick(MOON_STONE)});}
 const top=new THREE.CylinderGeometry(R0*.5,R0*.55,H*.5,16);top.translate(x,y+H*.25,z);stoneParts.push(coloredPart(top,'#c6ccc6'));
 const cres=new THREE.RingGeometry(R0*.13,R0*.2,20,1,Math.PI*.2,Math.PI*1.2);cres.translate(x,y+H*.55,z+R0*1.03);
 scene.add(new THREE.Mesh(cres,new THREE.MeshBasicMaterial({color:'#7d8a86'})));
 COLLIDERS.push({x,z,r:R0*.95});ALTAR={x,z,y,r:R0};
}
function standingStone(u,vFoot,w,vTop){
 const[x,y,z]=onGround(u,vFoot),width=wide(u-w/2,u+w/2,vFoot,y),H=tall(x,z,y,vTop);
 // a tall stone, a little narrower at the top, leaning slightly, moss on its crown and creepers at its foot
 fieldStone(x,y-M(.3),z,width,H+M(.3),width*R(.55,.7),{ry:R(-.4,.4),rz:R(-.05,.05),moss:.55,base:pick(MOON_STONE),chamfer:.3});
 for(let k=0;k<3;k++)addBush(x+R(-.6,.6)*width,y,z+width*R(.2,.6),M(R(.25,.4)),{sy:.6,tint:R(-.1,.2)});
 COLLIDERS.push({x,z,r:width*.45});
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
