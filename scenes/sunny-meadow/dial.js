// Original pieces for the Sunny Meadow: a sundial on a round, two-tier stone dais with three steps
// at its front, weathered stone posts round it, low mossy outcrops and oaks whose roots flare
// into the grass. Shared helpers (coloured parts, bark in the game trunk style, rooted trees) are
// the Old Root Stone Ring's.
let DIAL=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const DIAL_STONE=['#d3cdc2','#c9c3b8','#dcd6ca','#c2bcb2'];
// a ring of dressed blocks round (cx, cz): radius r, height h, standing on y
function blockRing(cx,cz,y,r,h,depth,skip){
 const n=Math.max(10,Math.round(2*Math.PI*r/M(.75)));
 for(let i=0;i<n;i++){const a=(i+.5)/n*Math.PI*2;if(skip&&skip(a))continue;
  block(cx+Math.cos(a)*r,y-.04,cz+Math.sin(a)*r,2*Math.PI*r/n*.96,h,depth,-a+Math.PI/2+R(-.02,.02),.22,{base:pick(DIAL_STONE)});}
}
function sundial(u,v){
 // the dais: a wide low course, a second course inside it, the dial disc on top and its blade
 const[x,z]=P(u,v,0),y=height(x,z),R0=wide(u-.10,u+.10,v,0)/2,front=a=>Math.sin(a)>.86;
 const H1=M(.32),H2=M(.34),HD=M(.16);
 blockRing(x,z,y,R0*.9,H1,R0*.2,front);
 blockRing(x,z,y+H1,R0*.66,H2,R0*.24);
 // the steps at the front: three curved courses climbing to the dais
 for(let s=0;s<3;s++){const rr=R0*(1.16-s*.13),hh=H1*(s+1)/3+(s===2?H2*.5:0),arc=.42-s*.06;
  for(let k=-2;k<=2;k++){const a=Math.PI/2+k*arc/2.2;block(x+Math.cos(a)*rr,y-.04,z+Math.sin(a)*rr,rr*arc/2.2*.98,hh,R0*.16,-a+Math.PI/2,.2,{base:pick(DIAL_STONE)});}}
 // inside the courses the dais is filled flush
 const fill=new THREE.CylinderGeometry(R0*.82,R0*.86,H1,28);fill.translate(x,y+H1/2-.02,z);stoneParts.push(coloredPart(fill,'#c9c3b8'));
 const fill2=new THREE.CylinderGeometry(R0*.58,R0*.6,H2,28);fill2.translate(x,y+H1+H2/2-.02,z);stoneParts.push(coloredPart(fill2,'#cfc9be'));
 // the dial: a pale disc with a carved ring of hour marks and a star at its heart
 const top=y+H1+H2,disc=new THREE.CylinderGeometry(R0*.55,R0*.57,HD,40);disc.translate(x,top+HD/2,z);stoneParts.push(coloredPart(disc,'#e2ddd2'));
 const face=top+HD+.012,carve=new THREE.MeshBasicMaterial({color:'#9c968b'}),marks=[];
 for(const[r0,r1]of[[.47,.49],[.37,.385]]){const g=new THREE.RingGeometry(R0*r0,R0*r1,48);g.rotateX(-Math.PI/2);g.translate(x,face,z);marks.push(g);}
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2,l=i%2?.04:.08,g=new THREE.PlaneGeometry(R0*.012,R0*l);g.rotateX(-Math.PI/2);g.rotateY(-a);const rr=R0*(.43-l/2+.02);g.translate(x+Math.cos(a)*rr,face,z+Math.sin(a)*rr);marks.push(g);}
 const star=new THREE.Shape();for(let i=0;i<16;i++){const a=i/16*Math.PI*2,rr=R0*(i%2?.08:.3);star[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}
 const sg=new THREE.ShapeGeometry(star);sg.rotateX(-Math.PI/2);sg.translate(x,face,z);marks.push(sg);
 scene.add(new THREE.Mesh(mergeGeometries(marks),carve));
 // the gnomon: a tall triangular blade of stone standing across the face, its flat side to the
 // south as in the concept, as tall as the concept's blade
 const hBlade=tall(x,z,face,.13),len=R0*.5,blade=new THREE.Shape();
 blade.moveTo(-len*.55,0);blade.lineTo(len*.35,0);blade.lineTo(len*.18,hBlade);blade.lineTo(len*.02,hBlade*.94);blade.closePath();
 const bg=new THREE.ExtrudeGeometry(blade,{depth:R0*.06,bevelEnabled:true,bevelSize:R0*.012,bevelThickness:R0*.012,bevelSegments:1});
 bg.translate(0,0,-R0*.03);bg.rotateY(-.35);bg.translate(x,face-.02,z);stoneParts.push(coloredPart(bg,'#d8d2c6'));
 COLLIDERS.push({x,z,r:R0*.95});DIAL={x,z,y,r:R0,top:face};
 return{x,z,y,R0};
}
// weathered stone posts round the dais, leaning a little, moss on their crowns
function dialPosts(d){
 for(const[deg,hs]of[[198,1.05],[230,1.3],[262,1.15],[298,1.35],[334,1.15],[18,1.0],[162,.95]]){
  const a=deg*Math.PI/180,rr=d.R0*1.2,x=d.x+Math.cos(a)*rr,z=d.z+Math.sin(a)*rr,y=height(x,z),w=M(.72);
  fieldStone(x,y-M(.3),z,w,M(hs)+M(.3),w*R(.75,.9),{ry:-a+R(-.2,.2),rz:R(-.06,.06),moss:.55,base:pick(DIAL_STONE),chamfer:.22});
  for(let k=0;k<2;k++)addBush(x+R(-.5,.5)*w,y,z+R(-.5,.5)*w,M(R(.22,.34)),{sy:.6,tint:R(-.1,.2)});
  COLLIDERS.push({x,z,r:w*.5});
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
