// Original pieces for Root Warren: the great tree whose roots pour over the warren bank, the
// burrows in the bank's face, the root arch over the north-west path (the region's Great Root
// Arch), mossy blocks, fern clumps and Moonroot's glowing plants.
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const MOON_STONE=['#c9cfc9','#bec5c0','#d3d8d2','#b5bdb8'];
const fernParts=[];
// a clump of broad fern fronds: long arching blades with leaflets down both sides
function fernClump(x,y,z,s){
 const n=7+Math.floor(rand()*4);
 for(let k=0;k<n;k++){
  const a=k/n*Math.PI*2+R(-.3,.3),L=s*R(.8,1.2),pts=[];
  for(let i=0;i<=6;i++){const t=i/6;pts.push(new V3(x+Math.cos(a)*L*t,y+L*.55*Math.sin(t*Math.PI*.8),z+Math.sin(a)*L*t));}
  const c=new THREE.CatmullRomCurve3(pts);
  for(let i=1;i<14;i++){const t=i/14,q=c.getPoint(t),tg=c.getTangent(t),w=s*.24*Math.sin(t*Math.PI)*(1-t*.3);
   for(const side of[-1,1]){const nx=-tg.z*side,nz=tg.x*side,g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([q.x,q.y,q.z,q.x+nx*w+tg.x*w*.6,q.y-w*.25,q.z+nz*w+tg.z*w*.6,q.x+tg.x*w*.5,q.y,q.z+tg.z*w*.5],3));g.computeVertexNormals();fernParts.push(coloredPart(g,pick(['#7cba52','#93c95e','#69a84a'])));}}
 }
}
const BURROWS=[];
// A burrow, as the reference's: a dark round mouth in the bank's face under an arch of small
// earth-brown stones, a little spoil heap and pebbles before it.
function burrow(u,v,w){
 const[x,y,z]=onGround(u,v),r=wide(u-w/2,u+w/2,v,y)/2*1.2;
 // the mouth: a dark tunnel running back into the bank, darker deeper in
 for(const[d,k,c]of[[0,1,'#2a221b'],[r*.5,.82,'#1b1612'],[r*1.0,.62,'#100d0b']]){const g=new THREE.CircleGeometry(r*k,18);g.scale(1,.85,1);g.translate(x,y+r*.6-d*.12,z+.05-d);fernParts.push(coloredPart(g,c));}
 // a rim of small earth-brown stones round its arch, set into the face, as the reference's
 const n=11;for(let i=0;i<=n;i++){const a=Math.PI*i/n,px=x+Math.cos(a)*r*1.18,py=y+r*.6+Math.sin(a)*r*1.05;
  addStone(px,py-r*.14,z+r*.2,r*R(.3,.38),r*R(.24,.3),r*R(.3,.36),{extra:3,chamfer:.35,noLine:true,moss:i>3&&i<8?.35:.05,base:pick(['#b29473','#a3866a','#bd9f7e']),ry:a});}
 BURROWS.push([x,z,r]);
 // dug earth spread before it, pebbles, and a few small mushrooms by the mouth
 for(let k=0;k<10;k++)addStone(x+R(-1.4,1.4)*r,y-.05,z+r*R(.5,1.6),r*R(.15,.3),r*R(.1,.18),r*R(.15,.25),{extra:3,chamfer:.3,noLine:true,moss:0,base:pick(['#9b7a58','#a98a68','#8f7154'])});
 for(let k=0;k<(rand()<.7?3:2);k++){const px=x+R(-1.4,1.4)*r,pz=z+r*R(.3,.8),py=height(px,pz),h=r*R(.4,.6);
  const st=new THREE.CylinderGeometry(h*.2,h*.25,h,6);st.translate(px,py+h/2,pz);fernParts.push(coloredPart(st,'#efe6d3'));
  const cap=new THREE.SphereGeometry(h*.42,8,5,0,Math.PI*2,0,Math.PI/2);cap.scale(1,.7,1);cap.translate(px,py+h*.92,pz);fernParts.push(coloredPart(cap,pick(['#c9814f','#d79a63','#b56f44'])));}
}
// The warren bank's face, as the reference's: earth set with small rounded stones, thin roots
// hanging over its lip, grass and flowers spilling from the top, ferns and flowers along its foot.
function bankFace(){
 const pts=[];
 for(let i=0;i<5000&&pts.length<260;i++){
  const[x,y,z]=onGround(R(.34,.84),R(.30,.47)),g=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;
  if(g<.9||BURROWS.some(([bx,bz,r])=>Math.hypot(x-bx,z-bz)<r*1.5))continue;pts.push([x,y,z]);
 }
 for(const[x,y,z]of pts){const r=M(R(.09,.2));addStone(x,y-r*.35,z+r*.1,r*R(1.1,1.6),r,r*R(.9,1.2),{extra:4,chamfer:.38,noLine:true,moss:rand()<.25?.4:0,base:pick(['#9c7c5c','#8c6e52','#a6876a','#b09276','#7f6650']),ry:R(0,6)});}
 // the lip: walk along the top of the face, grass and flowers spilling over it, roots hanging down
 for(let i=0;i<=60;i++){
  const u=.34+.5*i/60;let lip=null;
  for(let v=.28;v<.5;v+=.004){const[x,y,z]=onGround(u,v),g=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(g>.9){lip=[x,y,z];break;}}
  if(!lip)continue;const[x,y,z]=lip;
  for(let k=0;k<3;k++){const px=x+R(-.4,.4),pz=z-R(0,.3);grassItems.push({x:px,y:height(px,pz)-.02,z:pz,s:R(.9,1.3),ry:R(0,6.28),k:R(.9,1.08)});if(rand()<.5)flowerItems.push({x:px,y:height(px,pz)+.02,z:pz,s:R(.7,1),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f7da54'});}
  if(i%3===0)addBush(x,y-.15,z+.1,M(R(.22,.36)),{sy:.55,tint:R(-.05,.25)});
  if(rand()<.45&&!BURROWS.some(([bx,bz,r])=>Math.abs(x-bx)<r*1.4)){
   const rp=[];let pz=z-.2;for(let j=0;j<10;j++){rp.push(new V3(x+Math.sin(j*.9+i)*.08,height(x,pz)+.06,pz));pz+=.22;if(height(x,pz)<y-PL*.9)break;}
   if(rp.length>2)rootParts.push(barkTube(rp,M(R(.035,.06)),M(.012),12));
  }
 }
 // ferns and flowers along the foot of the face
 for(let i=0;i<40;i++){const[x,y,z]=onGround(R(.36,.82),R(.40,.47));const g=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(g>.5||BURROWS.some(([bx,bz,r])=>Math.hypot(x-bx,z-bz-r)<r*1.8))continue;
  if(rand()<.35)fernClump(x,y-.05,z,M(R(.6,1)));else for(let k=0;k<3;k++){const px=x+R(-.5,.5),pz=z+R(-.3,.3);flowerItems.push({x:px,y:height(px,pz)+.02,z:pz,s:R(.75,1),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f7da54'});}}
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
function rootPath(x,z,y0,s,a,hs,len,wobble,n=11){
 const pts=[],rt=trunkRadius(hs)*s,r0=trunkRadius(0)*s;
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
