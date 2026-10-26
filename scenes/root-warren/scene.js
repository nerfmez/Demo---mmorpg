// Root Warren: a wide clearing under a great old tree whose roots pour over an earth bank full of
// burrows; a root arch spans the north-west path, a stone stair climbs the right bank.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
// The great tree, as the reference's: a huge trunk of the game's own on the high ground, and a few
// very thick roots that pour over the warren bank, each steered to where the reference draws it,
// half buried, wandering a little and forking, moss and bushes along their tops.
const ROOT_PTS=[];
const onRoot=(x,z,pad=0)=>ROOT_PTS.some(([px,pz,r])=>Math.hypot(x-px,z-pz)<r+pad)||BURROWS.some(([bx,bz,r])=>Math.hypot(x-bx,z-bz-r)<r*2.4);
function rootTo(x0,y0,z0,tu,tv,thick,lift){
 const[tx,tz]=P(tu,tv,0),n=34,pts=[];
 for(let i=0;i<=n;i++){
  const t=i/n,e=t*t*(3-2*t),px=x0+(tx-x0)*t+Math.sin(t*5.2+thick)*M(.35)*Math.sin(t*Math.PI),pz=z0+(tz-z0)*e;
  const g=height(px,pz),rise=lift*Math.pow(1-smooth(0,.3,t),1.5);pts.push(new V3(px,i===0?y0+lift:g+rise+thick*.35,pz));
 }
 return pts;
}
function greatTree(u,v,s){
 const[x,y,z]=onGround(u,v);broadleaf(x,z,s,5);COLLIDERS.push({x,z,r:s*.42});
 // [target u, v, thickness in concept metres] for each great root, left to right
 for(const[tu,tv,th,ang]of[[.31,.22,.24,-2.9],[.43,.36,.26,-2.1],[.36,.27,.30,-2.6],[.40,.33,.34,-2.3],[.47,.30,.28,-1.9],[.53,.37,.30,-1.6],[.635,.39,.32,-1.3],[.71,.36,.30,-.9],[.79,.45,.36,-.6],[.87,.46,.30,-.3],[.74,.18,.26,.2]]){
  const thick=M(th*1.9),hs=.6,a0=ang,sx=x+Math.cos(a0)*trunkRadius(hs)*s*.3,sz=z+Math.sin(a0)*trunkRadius(hs)*s*.3;
  const pts=rootTo(sx,y-.05,sz,tu,tv,thick,hs*s*.85);
  rootParts.push(barkTube(pts,thick*1.15,thick*.22,70));ROOT_PTS.push(...pts.map(p=>[p.x,p.z,thick*1.3]));
  // a fork off it, thinner, and a strand twisting round it
  const i0=Math.round(R(.45,.7)*(pts.length-1)),o=pts[i0],dir=new V3().subVectors(pts.at(-1),o).normalize(),side=new V3(-dir.z,0,dir.x).multiplyScalar(rand()<.5?-1:1),bl=M(R(1.2,2.2)),bp=[o.clone()];
  for(let j=1;j<=8;j++){const t=j/8,p=o.clone().addScaledVector(dir,bl*t*.6).addScaledVector(side,bl*t);p.y=height(p.x,p.z)+thick*.2*(1-t);bp.push(p);}
  rootParts.push(barkTube(bp,thick*.55,thick*.1,16));
  if(th>=.3){const tw=pts.slice(0,Math.round(pts.length*.75)).map((p,i,a)=>{const t=i/(a.length-1),ph=t*10;return new V3(p.x+Math.cos(ph)*thick*1.05,p.y+Math.sin(ph)*thick*.7,p.z+Math.sin(ph)*thick*1.05);});rootParts.push(barkTube(tw,thick*.4,thick*.15,40));}
  // moss and small bushes riding the root
  for(let k=0;k<4;k++){const q=pts[Math.round(R(.2,.85)*(pts.length-1))];addBush(q.x,q.y+thick*.4,q.z,M(R(.25,.4)),{sy:.5,tint:R(-.15,.2)});}
  COLLIDERS.push({x:pts[Math.round(pts.length*.5)].x,z:pts[Math.round(pts.length*.5)].z,r:thick});
 }
}
// The root arch: two great roots rise from either side of the path, meet overhead and twist down
// again, thinner roots braided round them (the region's Great Root Arch).
function rootArch(uA,vA,uB,vB,vTop){
 const[ax,ay,az]=onGround(uA,vA),[bx,by,bz]=onGround(uB,vB),mx=(ax+bx)/2,mz=(az+bz)/2,top=tall(mx,mz,Math.max(ay,by),vTop)+Math.max(ay,by);
 const center=[];for(let i=0;i<=24;i++){const t=i/24,x=ax+(bx-ax)*t,z=az+(bz-az)*t,yb=ay+(by-ay)*t,y=yb+(top-yb)*Math.pow(Math.sin(t*Math.PI),.8);center.push(new V3(x,y,z));}
 // braided: seven roots twisting round each other along the arch, their strands showing gaps
 for(let k=0;k<7;k++){
  const ph0=k/7*Math.PI*2,rad=M(.45+.12*Math.sin(k*2.3)),turns=2.2+k%3*.5,pts=center.map((c,i)=>{const t=i/24,ph=ph0+t*Math.PI*2*turns;return new V3(c.x+Math.cos(ph)*rad*.5,c.y+Math.sin(ph)*rad,c.z+Math.cos(ph+1.3)*rad);});
  const thick=M(R(.2,.32));rootParts.push(barkTube(pts,thick*1.2,thick*.85,70));
 }
 for(let k=0;k<6;k++){const c=center[Math.round(R(.15,.85)*24)];addBush(c.x,c.y+M(.3),c.z,M(R(.25,.4)),{sy:.5,tint:R(-.1,.2)});}
 // their feet flare into the ground on both sides
 for(const[x,y,z]of[[ax,ay,az],[bx,by,bz]])for(let k=0;k<7;k++){const a=k/7*Math.PI*2+R(-.3,.3);rootParts.push(barkTube(rootPath(x,z,y-.05,2.6,a,.5,M(R(1.4,2.4)),R(0,6)),M(.3),M(.04),14));}
 COLLIDERS.push({x:ax,z:az,r:M(.45)},{x:bx,z:bz,r:M(.45)});
}
function warrenRocks(){
 for(const[u,v,w,h]of[[.345,.33,.045,.10],[.385,.245,.04,.08],[.365,.15,.04,.08],[.60,.24,.04,.06],[.515,.19,.035,.06],[.72,.13,.05,.08],[.79,.27,.035,.05],[.985,.36,.04,.10],[.31,.39,.035,.04],[.36,.40,.03,.035],[.02,.32,.04,.06],[.13,.38,.04,.05],[.62,.50,.03,.035],[.665,.56,.03,.03],[.70,.53,.025,.025],[.40,.52,.025,.025],[.22,.95,.05,.06],[.86,.87,.06,.09],[.80,.92,.05,.06],[.06,.78,.05,.08],[.14,.88,.05,.07],[.27,.87,.04,.05],[.12,.68,.05,.07],[.08,.72,.04,.06],[.90,.80,.05,.08],[.95,.70,.05,.09],[.74,.97,.05,.06]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.4)continue;
  // squared, cracked, mossy blocks, as the reference's (the shared ruin stone)
  block(x,y-M(.25),z,width,hh+M(.25),width*R(.75,.9),R(-.4,.4),.7,{base:pick(MOON_STONE)});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<2;k++)addBush(x+R(-.6,.6)*width,y,z+width*R(.3,.6),M(R(.25,.4)),{sy:.6,tint:R(-.1,.2)});
 }
}
function scatteredRocks(){
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.10,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantGrove(){
 const trees=[[.04,.10,2.2,9],[.20,.03,2.1,5],[.97,.08,2.2,3],[.99,.55,2.1,9],[.02,.52,2.1,3],[.40,.02,2.0,9],[-.04,.80,2.0,5],[1.04,.80,2.0,3]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  rootTree(u,v,s*.95,seed);
 }
 for(const[u,v,s,seed]of[[.04,.22,4.4,3],[.97,.36,4.2,9],[.20,.03,3.4,5],[.32,.07,3.0,9],[.80,.06,3.4,3],[.93,.12,3.2,5]])rootTree(u,v,s,seed);
 // the front corners: dense bushes and ferns round the blocks
 for(let i=0;i<220;i++){const left=rand()<.5,[x,y,z]=onGround(left?R(-.05,.32):R(.70,1.05),R(.66,1.05));if(trailEdge(x,z)<M(.5)||(polyAt(PLAZA,x,z)??1)<M(.4))continue;if(rand()<.4)fernClump(x,y-.05,z,M(R(.8,1.3)));else addBush(x,y-.1,z,M(R(.45,.8)),{sy:R(.55,.8),tint:R(-.05,.25)});}
 // the bank's top is a thicket, as the reference's
 for(let i=0;i<480;i++){const[x,y,z]=onGround(R(.32,.84),R(.12,.37));if(field(x,z).top<.5||onRoot(x,z,M(.15)))continue;addBush(x,y-.1,z,M(R(.3,.55)),{sy:R(.5,.75),tint:R(-.05,.25)});}
 for(let i=0;i<90;i++){const[x,y,z]=onGround(R(.0,1.0),R(.12,.98));if(trailEdge(x,z)<M(.5)||field(x,z).rock>.25||(polyAt(PLAZA,x,z)??1)<M(.3)||onRoot(x,z,M(.3)))continue;fernClump(x,y-.05,z,M(R(.7,1.2)));}
 for(let i=0;i<1400;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5)||onRoot(x,z,M(.6)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.75)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.35)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f7da54'});
 }
}
// Moonroot's palette: deep teal-green crowns with pale yellow-green light, sage shrubs
FOL.leaf=['#143f40','#2a705f','#7db888'];FOL.shrub=['#16473f','#33805f','#8cc58a'];STONE.splice(0,STONE.length,...MOON_STONE);
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.80);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 greatTree(.62,.19,10);rootArch(.12,.32,.29,.31,.16);warrenRocks();
 burrow(.455,.38,.032);burrow(.585,.375,.032);burrow(.675,.415,.032);
 scatteredRocks();plantGrove();glowPlants();
 const ferns=new THREE.Mesh(mergeGeometries(fernParts),paint({vertexColors:true,shade:[.5,.62,.5],mid:[.86,.95,.8]}));ferns.material.side=THREE.DoubleSide;ferns.receiveShadow=true;scene.add(ferns);
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c5452')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
