// Original stone pieces for the reference's headland court: a weathered stone gate with a gull
// carved on its crossbeam, a stone lantern each side, a ring of flat stones round a low standing
// stone, and old standing stones at the court's edge. All masonry uses the shared stone style.
let GATE=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const GATE_STONE=['#cfcac3','#c4bfb8','#d6d0c7','#bdb8b1'];
function stoneGate(){
 // feet and heights as the reference shows them, on the court level
 const[ax,az]=P(.588,.197,PL),[bx,bz]=P(.692,.199,PL),ya=height(ax,az),yb=height(bx,bz),y0=Math.min(ya,yb)-.2;
 const mx=(ax+bx)/2,mz=(az+bz)/2,span=Math.hypot(bx-ax,bz-az),ry=Math.atan2(bx-ax,bz-az)-Math.PI/2;
 const ux=(bx-ax)/span,uz=(bz-az)/span,pw=wide(.577,.600,.197,PL);
 const top=tall(mx,mz,y0,.058),beam=tall(mx,mz,y0,.092),lintel=M(.32);
 // two square pillars of stacked drums, each a little narrower than the one below
 for(const[x,z]of[[ax,az],[bx,bz]]){
  const n=5;let y=y0;
  for(let i=0;i<n;i++){const h=(top-lintel*.2)/n,w=pw*(1-i*.035);block(x,y,z,w,h*1.01,w,ry+R(-.03,.03),i===0?.3:.12,{base:pick(GATE_STONE)});y+=h;}
  block(x,y0-.1,z,pw*1.35,M(.32),pw*1.35,ry,.35,{base:'#b9b4ad'});
  COLLIDERS.push({x,z,r:pw*.62});
 }
 // the lintel overhangs both pillars; a lower crossbeam carries the gull
 const L=span+pw*2.2;
 block(mx,y0+top-lintel*.2,mz,L,lintel,pw*1.05,ry,.25,{base:'#d3cdc4'});
 block(mx,y0+beam,mz,span+pw*.9,M(.30),pw*.72,ry,.1,{base:'#c8c2ba'});
 // the gull: a white carved bird on a plaque at the crossbeam's middle
 const face=new V3(Math.sin(ry),0,Math.cos(ry)),py=y0+beam+M(.15),birdY=py+M(.42);
 block(mx+face.x*pw*.2,py,mz+face.z*pw*.2,M(1.4),M(.85),M(.16),ry,0,{base:'#c4beb4'});
 const bird=new THREE.Group(),gull='#f4f1ea';
 const wing=(side)=>{const g=new THREE.BoxGeometry(M(.62),M(.09),M(.06));g.translate(side*M(.32),0,0);g.rotateZ(side*.42);return g;};
 const parts=[wing(-1),wing(1),new THREE.BoxGeometry(M(.22),M(.16),M(.08))];
 const tail=new THREE.BoxGeometry(M(.12),M(.14),M(.06));tail.translate(0,-M(.13),0);parts.push(tail);
 const mesh=new THREE.Mesh(mergeGeometries(parts.map(g=>coloredPart(g,gull))),paint({vertexColors:true,shade:[.62,.62,.66],mid:[.92,.92,.9]}));
 mesh.position.set(mx+face.x*(pw*.2+M(.12)),birdY,mz+face.z*(pw*.2+M(.12)));mesh.rotation.y=ry;mesh.castShadow=true;bird.add(mesh);
 GATE={x:mx,z:mz,y:y0,span,ry,group:bird};
 return bird;
}
function stoneLantern(u,v){
 const[x,z]=P(u,v,PL),y=height(x,z)-.1,w=wide(u-.012,u+.012,v,PL),h=tall(x,z,y,v-.05);
 block(x,y,z,w*1.5,h*.12,w*1.5,R(-.2,.2),.35,{base:'#bdb8b1'});
 block(x,y+h*.12,z,w*.62,h*.40,w*.62,0,.2,{base:pick(GATE_STONE)});
 block(x,y+h*.52,z,w*1.2,h*.08,w*1.2,0,.2,{base:'#c9c3bb'});
 block(x,y+h*.60,z,w*1.0,h*.22,w*1.0,0,.1,{base:'#d6d0c7'});
 block(x,y+h*.82,z,w*1.45,h*.10,w*1.45,.78,.3,{base:'#c4bfb8'});
 block(x,y+h*.92,z,w*.5,h*.08,w*.5,.78,.2,{base:'#bdb8b1'});
 COLLIDERS.push({x,z,r:w*.8});
}
function stoneCircle(){
 // a ring of flat paving stones round a low standing stone, in the middle of the court
 const[cx,cz]=P(.585,.285,PL),r=wide(.515,.655,.285,PL)/2,n=22;
 for(let i=0;i<n;i++){
  const a=i/n*Math.PI*2,x=cx+Math.sin(a)*r,z=cz+Math.cos(a)*r*.92,w=2*Math.PI*r/n*.86;
  block(x,height(x,z)-.12,z,w,M(.10),M(.55),a+Math.PI/2+R(-.06,.06),.05,{base:pick(['#c9c3ba','#bfb9b0','#d1cbc1'])});
 }
 for(let i=0;i<9;i++){const a=i/9*Math.PI*2+.2,x=cx+Math.sin(a)*r*.55,z=cz+Math.cos(a)*r*.5;block(x,height(x,z)-.1,z,M(.7),M(.08),M(.45),a,.05,{base:'#c7c1b8'});}
 const h=tall(cx,cz,PL,.245);
 block(cx,height(cx,cz)-.2,cz,M(.75),h+.2,M(.6),.3,.3,{base:'#cbc5bc'});COLLIDERS.push({x:cx,z:cz,r:M(.45)});
}
function standingStones(){
 // old pillars ring the court, as the reference's: [u, v, width, height] as screen fractions
 for(const[u,v,w,h]of[[.47,.13,.03,.075],[.505,.17,.024,.055],[.405,.235,.03,.07],[.40,.30,.026,.06],[.44,.355,.022,.045],[.52,.375,.02,.035],[.72,.38,.024,.04],[.775,.33,.03,.06],[.815,.27,.03,.07],[.79,.205,.026,.06],[.445,.28,.018,.032],[.32,.075,.03,.07],[.36,.12,.025,.05],[.86,.36,.03,.08]]){
  const[x,z]=P(u,v,PL),y=height(x,z),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.6||seaDist(x,z)>-1.2||(polyAt(PLAZA,x,z)??1)<-.5)continue;
  // two stacked, weathered blocks, mossy on top
  const H=hh*.72+.3,ry=R(-.6,.6),d=width*R(.7,.9);
  block(x,y-.3,z,width,H*.58,d,ry,.25,{base:pick(GATE_STONE),rx:R(-.04,.04),rz:R(-.04,.04)});
  block(x+R(-.08,.08),y-.3+H*.58,z+R(-.08,.08),width*R(.82,.95),H*.42,d*R(.82,.95),ry+R(-.12,.12),.7,{base:pick(GATE_STONE)});
  addBush(x+width*.6,y,z,R(.55,.8),{sy:.6,tint:R(-.1,.1)});
  COLLIDERS.push({x,z,r:width*.5});
 }
}
