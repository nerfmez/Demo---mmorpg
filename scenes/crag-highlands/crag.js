// Original pieces for Crag Highlands: the brazier shrine on the high shelf (a stone fire bowl on a
// stepped plinth with its flame, weathered pillars round a paved court), the ruined dressed-stone wall
// by the east path. Shared helpers from Greyfang Den: coloured parts, bark-style trunks and rooted
// trees (the scene's trees are all the game's own, owner 31 October 2026).
let BRAZIER=null;
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

const DRESSED=['#cfc9bf','#c4beb3','#d8d2c7','#bcb6ab'];
// the shrine on the high shelf: a paved court, a stepped plinth with the stone fire bowl and its flame,
// weathered pillars round it (one broken), as the concept's
const flames=[];
function shrine(u,v){
 const[x,y,z]=onGround(u,v);BRAZIER={x,y,z};
 // the court: square slabs, a little sunk and uneven
 const S=M(.62);
 for(let i=-3;i<=3;i++)for(let j=-2;j<=3;j++){if(Math.abs(i)+Math.abs(j)>5||rand()<.06)continue;const px=x+i*S,pz=z+j*S;block(px,height(px,pz)-M(.12),pz,S*R(.93,.98),M(.16),S*R(.93,.98),R(-.03,.03),.25,{base:pick(DRESSED),ink:.006*K});}
 // the plinth: three square courses, then the bowl's drum
 let yy=y;for(const[w,h]of[[2.0,.35],[1.55,.35],[1.15,.4]]){block(x,yy-.05,z,M(w),M(h)+.05,M(w),0,.35,{base:pick(DRESSED)});yy+=M(h);}
 for(let k=0;k<3;k++){block(x,yy,z,M(.75-k*.04),M(.32),M(.75-k*.04),k*.4,.2,{base:pick(DRESSED)});yy+=M(.32);}
 const bowl=new THREE.CylinderGeometry(M(.62),M(.42),M(.38),10,1,true);
 stoneParts.push(coloredPart(bowl,'#b8b1a6',new THREE.Matrix4().makeTranslation(x,yy+M(.19),z)));
 const rim=new THREE.TorusGeometry(M(.6),M(.07),5,12);rim.rotateX(Math.PI/2);stoneParts.push(coloredPart(rim,'#a8a196',new THREE.Matrix4().makeTranslation(x,yy+M(.38),z)));
 const coal=new THREE.CircleGeometry(M(.56),10);coal.rotateX(-Math.PI/2);stoneParts.push(coloredPart(coal,'#4a2a1a',new THREE.Matrix4().makeTranslation(x,yy+M(.3),z)));
 // the flame: layered cones, hot core to orange skirt, flickering (updateAmbience), and a warm glow
 const fy=yy+M(.32);
 for(const[r,h,c,o]of[[.42,1.25,'#ff8a2a',.85],[.3,1.05,'#ffb43a',.9],[.18,.8,'#fff2a6',1]]){
  const g=new THREE.ConeGeometry(M(r),M(h),8,1,true);g.translate(0,M(h)/2,0);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,side:THREE.DoubleSide}));m.position.set(x,fy,z);m.renderOrder=6;scene.add(m);flames.push({m,ph:R(0,6),h});
 }
 const gc=document.createElement('canvas');gc.width=gc.height=64;const gx=gc.getContext('2d'),gr=gx.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,200,110,.9)');gr.addColorStop(1,'rgba(255,140,40,0)');gx.fillStyle=gr;gx.fillRect(0,0,64,64);
 const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(gc),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.75}));glow.position.set(x,fy+M(.5),z);glow.scale.setScalar(M(2.6));glow.renderOrder=7;scene.add(glow);flames.push({glow});
 COLLIDERS.push({x,z,r:M(1.1)});
 // weathered pillars round the court: [u, v, height in concept metres]
 for(const[pu,pv,h]of[[.565,.17,1.6],[.635,.12,2.0],[.775,.16,1.5],[.725,.085,1.1]]){
  const[px,,pz]=onGround(pu,pv),py=height(px,pz);let hy=py;const n=Math.round(h/.4);
  for(let k=0;k<n;k++){const w=M(R(.52,.6));block(px+R(-.05,.05),hy-.04,pz+R(-.05,.05),w,M(.4)+.04,w,R(-.08,.08),k===n-1?.6:.2,{base:pick(DRESSED)});hy+=M(.4);}
  addBush(px+M(.3),py,pz+M(.25),M(.3),{sy:.6});COLLIDERS.push({x:px,z:pz,r:M(.4)});
 }
}
// the ruined wall by the east path: dressed blocks in courses, broken down along its length, a taller
// pier at its end, as the concept's
function ruinedWall(){
 const pts=[[.745,.60],[.77,.66],[.80,.71],[.835,.745],[.87,.765]].map(([u,v])=>{const[x,,z]=onGround(u,v);return new V3(x,0,z);});
 const curve=new THREE.CatmullRomCurve3(pts),L=curve.getLength(),B=M(.62),n=Math.round(L/B);
 for(let i=0;i<=n;i++){
  const t=i/n,p=curve.getPoint(t),d=curve.getTangent(t),ry=Math.atan2(d.x,d.z),y=height(p.x,p.z);
  const courses=i<2?6:Math.max(1,Math.round(3.2-2.2*t+R(-.6,.6)));
  for(let k=0;k<courses;k++)if(k<2||rand()<.85)block(p.x+R(-.04,.04),y-.05+k*M(.4),p.z+R(-.04,.04),M(.48),M(.4)+.04,B*R(.9,1),ry+R(-.04,.04),k===courses-1?.55:.15,{base:pick(DRESSED)});
  COLLIDERS.push({x:p.x,z:p.z,r:M(.32)});
 }
 // fallen blocks at its foot
 for(let k=0;k<5;k++){const p=curve.getPoint(R(.2,1));block(p.x+R(-1,1)*M(.8),height(p.x,p.z)-.1,p.z+M(R(.4,1)),M(.48),M(.36),M(.6),R(0,3),.4,{base:pick(DRESSED)});}
}
