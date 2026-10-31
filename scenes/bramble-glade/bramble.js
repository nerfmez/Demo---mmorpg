// Original pieces for the Bramble Glade: flowering bramble (bushes starred with pink and white wild
// roses), the bramble arch over the north path (two twisted bundles of woody stems meeting overhead,
// leafy and in flower), rock shelves under the brambles and old trees with flaring roots. Shared
// helpers: the Old Root Stone Ring's coloured parts and bark-style rooted trees, the Rose Garden's
// cupped roses and vine leaves, and the Hill Windmill's timber beam.
let ARCH=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const roseItems=[],vineLeafItems=[];
function addRose(p,s=0.26,color='#e7b5a3',normal=new V3(.1,.75,.65)){
 roseItems.push({x:p.x,y:p.y,z:p.z,s,color,normal:normal.clone().normalize(),roll:R(0,6.283)});
}
function roseGeometry(){
 const pos=[],col=[];
 for(const[n,r,len,y,lift,w]of[[8,.27,.70,.02,.25,.48],[6,.12,.55,.16,.38,.50],[4,.02,.34,.34,.38,.58]])for(let petal=0;petal<n;petal++){
  const angle=petal/n*6.283+y*4.1,tone=new THREE.Color().setRGB(.90+R(0,.10),.86+R(0,.12),.84+R(0,.14));
  const p=(u,t)=>{const a=angle+u*w*Math.pow(Math.sin(t*Math.PI),.65),rr=r+len*Math.sin(t*Math.PI*.5);return new V3(Math.sin(a)*rr,y+lift*Math.sin(t*Math.PI*.5)-.07*t*t+.10*u*u,Math.cos(a)*rr);};
  for(let row=0;row<3;row++)for(let k=0;k<3;k++){
   const u=-1+k*2/3,v=row/3,du=2/3,dv=1/3,A=p(u,v),B=p(u+du,v),C=p(u+du,v+dv),D=p(u,v+dv);
   for(const q of[A,B,C,A,C,D]){pos.push(q.x,q.y,q.z);col.push(tone.r,tone.g,tone.b);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
}
function placeRoses(){
 const mat=paint({vertexColors:true,side:THREE.DoubleSide,shade:[.56,.50,.52],mid:[.88,.78,.77],band:[-.25,.28]}),mesh=new THREE.InstancedMesh(roseGeometry(),mat,roseItems.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),roll=new THREE.Quaternion(),color=new THREE.Color();
 roseItems.forEach((it,i)=>{q.setFromUnitVectors(new V3(0,1,0),it.normal);roll.setFromAxisAngle(new V3(0,1,0),it.roll);q.multiply(roll);m.compose(new V3(it.x,it.y,it.z),q,new V3(it.s,it.s,it.s));mesh.setMatrixAt(i,m);mesh.setColorAt(i,color.set(it.color));});mesh.name='cupped-roses';mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
 const p=[0,0,0,-.40,.10,.45,0,.18,1.0,0,0,0,0,.18,1.0,.40,.10,.45],leaf=new THREE.BufferGeometry();leaf.setAttribute('position',new THREE.Float32BufferAttribute(p,3));leaf.computeVertexNormals();
 const leaves=new THREE.InstancedMesh(leaf,paint({color:'#69954b',side:THREE.DoubleSide,shade:[.48,.61,.47],mid:[.74,.86,.62]}),vineLeafItems.length);
 vineLeafItems.forEach((it,i)=>{q.setFromUnitVectors(new V3(0,1,0),it.normal);m.compose(it.p,q,new V3(it.s,it.s,it.s));leaves.setMatrixAt(i,m);});leaves.name='rose-vine-leaves';leaves.castShadow=leaves.receiveShadow=true;scene.add(leaves);
}
function woodBeam(a,b,width,color='#8c6c40'){
 const d=b.clone().sub(a),mat=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),d.clone().normalize()),new V3(1,1,1));
 woodParts.push(coloredPart(new THREE.BoxGeometry(width,d.length(),width),color,mat));
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

const BRAMBLE_ROSES=['#f2b8c6','#f6d4dc','#fbeef0','#e996ac','#fff6f2'];
// a bramble: a low mound of shrub starred with small wild roses
function bramble(x,y,z,s){
 addBush(x,y-.08,z,s,{sy:R(.6,.8),tint:R(-.08,.06)});
 const n=Math.round(2+s*3);
 for(let j=0;j<n;j++){
  const a=R(0,6.283),rad=R(.15,.8)*s,p=new V3(x+Math.cos(a)*rad,y+R(.55,1.05)*s*M(.55),z+Math.sin(a)*rad*.8);
  addRose(p,R(.26,.38),pick(BRAMBLE_ROSES),new V3(Math.cos(a)*.4,.9,Math.sin(a)*.4+.7));
 }
}
// the arch: a bundle of dark woody bramble stems twisting round each other along a round arch, so
// the north path passes under it, thick with leaves and roses on its back and sides
function brambleArch(ua,va,ub,vb,vTop){
 const[ax,ay,az]=onGround(ua,va),[bx,by,bz]=onGround(ub,vb),mx=(ax+bx)/2,mz=(az+bz)/2,H=tall(mx,mz,(ay+by)/2,vTop),span=Math.hypot(bx-ax,bz-az);
 const along=new V3(bx-ax,0,bz-az).normalize(),side=new V3(-along.z,0,along.x),up=new V3(0,1,0);
 const centre=new V3(mx,(ay+by)/2,mz),half=span/2;
 // a point on the arch's centre line at t in 0..1 (feet at 0 and 1), and its outward direction
 const at=t=>{const ang=Math.PI*(1-t);return{p:centre.clone().addScaledVector(along,Math.cos(ang)*half).addScaledVector(up,Math.sin(ang)*H),out:new V3().addScaledVector(along,Math.cos(ang)*H).addScaledVector(up,Math.sin(ang)*half).normalize()};};
 const keep={...FOL.trunk};Object.assign(FOL.trunk,{light:'#8a6a4c',mid:'#64492f',shadow:'#3d2b1d'});
 const strands=9;
 for(let k=0;k<strands;k++){
  const phase=k/strands*Math.PI*2,turns=R(2.2,3.2)*(k%2?1:-1),rr=M(R(.25,.42)),pts=[];
  for(let j=0;j<=40;j++){
   const t=j/40,{p,out}=at(t),a=phase+t*turns*Math.PI*2,r=rr*(1+.25*Math.sin(t*9+k));
   // the stems splay apart at the feet, as roots do
   const foot=1+1.6*Math.pow(Math.abs(t-.5)*2,6);
   pts.push(p.addScaledVector(side,Math.cos(a)*r*foot).addScaledVector(out,Math.sin(a)*r*foot));
  }
  rootParts.push(barkTube(pts,M(.17),M(.11),64));
 }
 Object.assign(FOL.trunk,keep);
 // leaves and roses: thick along the arch's back and sides, leaving its opening clear
 for(let j=0;j<120;j++){
  const t=R(.03,.97),{p,out}=at(t),a=R(0,6.283);
  p.addScaledVector(out,M(R(.15,.6))).addScaledVector(side,Math.cos(a)*M(.7));
  addBush(p.x,p.y-M(.35),p.z,R(.55,.95),{sy:.8,tint:R(-.06,.1)});
  if(rand()<.6)addRose(p.clone().addScaledVector(out,M(.3)).add(new V3(0,0,M(.2))),R(.26,.38),pick(BRAMBLE_ROSES),out.clone().add(new V3(0,.4,.6)));
 }
 for(const[x,z]of[[ax,az],[bx,bz]]){COLLIDERS.push({x,z,r:M(.7)});for(let k=0;k<3;k++)bramble(x+R(-1,1)*M(.7),height(x,z),z+R(-.4,1)*M(.7),R(.9,1.2));}
 ARCH={ax,az,bx,bz,top:H};
}
