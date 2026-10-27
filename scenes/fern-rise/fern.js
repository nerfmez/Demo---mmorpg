// Original pieces for Fern Rise: giant fiddlehead ferns (tall green stems that coil at the top, as
// the reference's and the region's Giant Fiddleheads), clumps of broad fern fronds, mossy blocks
// along the rise's face, old rooted trees and Moonroot's glowing plants.
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const MOON_STONE=['#c9cfc9','#bec5c0','#d3d8d2','#b5bdb8'];
const fernParts=[];
const FERN_GREEN=['#8cc44e','#7bb546','#9dd05a','#6fa83f'];
// A fiddlehead: a stem rising from the ground, leaning, then rolling into a flat spiral at the top.
// Small scale-like bumps run along it; the coil faces sideways as the reference's do.
function fiddlehead(u,v,vTop,turn,lean=0,grow=1){
 const[x,y,z]=onGround(u,v),H=tall(x,z,y,vTop)*grow,pts=[],face=turn;
 const ax=Math.cos(face),az=Math.sin(face);
 // the stem: up, with a slight S, to the start of the coil
 const stemH=H*.58,coilR=H*.21;
 for(let i=0;i<=10;i++){const t=i/10;pts.push(new V3(x+ax*lean*H*t*t+Math.sin(t*3)*H*.03,y-.2+stemH*t,z+az*lean*H*t*t));}
 // the coil: a spiral in the vertical plane through `face`, curling forward over the top and
 // winding inward about one and three quarter turns
 const T=pts.at(-1),C=new V3(T.x+ax*coilR,T.y,T.z+az*coilR);
 for(let i=1;i<=40;i++){const t=i/40,th=Math.PI-t*Math.PI*3.5,r=coilR*(1-t*.8);pts.push(new V3(C.x+Math.cos(th)*r*ax,C.y+Math.sin(th)*r,C.z+Math.cos(th)*r*az));}
 const curve=new THREE.CatmullRomCurve3(pts),seg=90,sides=9,g=new THREE.TubeGeometry(curve,seg,1,sides,false),p=g.attributes.position,ring=sides+1,r0=H*.042;
 for(let i=0;i<p.count;i++){const t=Math.floor(i/ring)/seg,q=curve.getPoint(t),rr=r0*(t<.25?1.15-t*.6:(1-(t-.25)/.75*.55))*(1+.05*Math.sin(t*60));p.setXYZ(i,q.x+(p.getX(i)-q.x)*rr,q.y+(p.getY(i)-q.y)*rr,q.z+(p.getZ(i)-q.z)*rr);}
 g.computeVertexNormals();fernParts.push(coloredPart(g,pick(FERN_GREEN)));
 // little curled leaflets on the outer side of the coil
 // small curled leaflets along the outside of the coil, as the reference's
 for(let k=0;k<16;k++){const t=.28+k*.04,q=curve.getPoint(t),s=new THREE.SphereGeometry(r0*.7,6,4);s.scale(1,.6,1);s.translate(q.x,q.y,q.z);fernParts.push(coloredPart(s,pick(['#a9d665','#94c75a'])));}
 COLLIDERS.push({x,z,r:r0*1.6});
}
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
