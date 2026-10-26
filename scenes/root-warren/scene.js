// Root Warren: a wide clearing under a great old tree whose roots pour over an earth bank full of
// burrows; a root arch spans the north-west path, a stone stair climbs the right bank.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
// The great tree: a trunk of the game's own, far larger, and long roots that run down over the
// bank toward the clearing, twisting round each other and forking, as the reference's.
function greatTree(u,v,s){
 const[x,y,z]=onGround(u,v);broadleaf(x,z,s,5);COLLIDERS.push({x,z,r:s*.42});
 const toward=Math.atan2(P(.55,.6,0)[1]-z,P(.55,.6,0)[0]-x);
 for(let k=0;k<11;k++){
  const front=k<7,a=front?toward+(k-3)*.26+R(-.06,.06):toward+Math.PI*(.5+(k-7)*.33),hs=R(.25,.45),len=front?s*R(3.4,4.6):s*R(1.2,1.8);
  const thick=trunkRadius(hs)*s*R(.62,.75),pts=rootPath(x,z,y-.05,s,a,hs,len,R(0,6),front?28:12);
  rootParts.push(barkTube(pts,thick,thick*.15,front?60:26));
  // forks, and a thinner strand twisting round the root
  for(let f=0;f<1;f++){
   const i0=Math.min(pts.length-2,Math.max(3,Math.round(R(.35,.7)*(pts.length-1)))),o=pts[i0],b=a+(rand()<.5?-1:1)*R(.35,.8),bl=len*R(.25,.45),bp=[o.clone()];
   for(let j=1;j<=6;j++){const t=j/6,px=o.x+Math.cos(b)*bl*t,pz=o.z+Math.sin(b)*bl*t;bp.push(new V3(px,height(px,pz)+M(.03)-M(.04)*t,pz));}
   rootParts.push(barkTube(bp,thick*(1-i0/(pts.length-1))*.7,thick*.08,12));
  }
  if(front&&k%3===0){const tw=pts.map((p,i)=>{const t=i/(pts.length-1),ph=t*9;return new V3(p.x+Math.cos(ph)*thick*.9*(1-t),p.y+Math.sin(ph)*thick*.6*(1-t),p.z+Math.sin(ph)*thick*.9*(1-t));});rootParts.push(barkTube(tw,thick*.35,thick*.06,30));}
 }
}
// The root arch: two great roots rise from either side of the path, meet overhead and twist down
// again, thinner roots braided round them (the region's Great Root Arch).
function rootArch(uA,vA,uB,vB,vTop){
 const[ax,ay,az]=onGround(uA,vA),[bx,by,bz]=onGround(uB,vB),mx=(ax+bx)/2,mz=(az+bz)/2,top=tall(mx,mz,Math.max(ay,by),vTop)+Math.max(ay,by);
 for(let k=0;k<6;k++){
  const off=(k-2.5)*M(.16),pts=[];
  for(let i=0;i<=16;i++){const t=i/16,x=ax+(bx-ax)*t,z=az+(bz-az)*t+off,yb=ay+(by-ay)*t,y=yb+(top-yb)*Math.sin(t*Math.PI)*(1+.08*Math.sin(t*7+k));pts.push(new V3(x+Math.sin(t*9+k)*M(.12),y+Math.cos(t*8+k)*M(.1),z));}
  const thick=M(k===2||k===3?.42:.22);
  rootParts.push(barkTube(pts,thick,thick*.8,40));
 }
 // their feet flare into the ground on both sides
 for(const[x,y,z]of[[ax,ay,az],[bx,by,bz]])for(let k=0;k<4;k++){const a=k/4*Math.PI*2+R(-.3,.3);rootParts.push(barkTube(rootPath(x,z,y-.05,2.6,a,.5,M(R(1.4,2.4)),R(0,6)),M(.3),M(.04),14));}
 COLLIDERS.push({x:ax,z:az,r:M(.45)},{x:bx,z:bz,r:M(.45)});
}
function scatteredRocks(){
 for(const[u,v,w,h]of[[.32,.25,.05,.10],[.37,.40,.04,.06],[.50,.41,.03,.04],[.63,.49,.05,.06],[.68,.55,.04,.04],[.40,.52,.03,.03],[.72,.12,.05,.09],[.38,.10,.05,.09],[.14,.53,.06,.09],[.10,.35,.05,.08],[.86,.67,.06,.09],[.27,.82,.05,.07],[.39,.84,.04,.05],[.80,.88,.08,.11],[.96,.30,.05,.08]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5)continue;
  fieldStone(x,y-M(.25),z,width*R(.8,.95),hh+M(.25),width*R(.65,.8),{ry:R(-.9,.9),moss:.6,base:pick(MOON_STONE),chamfer:.4});COLLIDERS.push({x,z,r:width*.4});
 }
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.10,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantGrove(){
 const trees=[[.04,.10,2.2,9],[.20,.03,2.1,5],[.97,.08,2.2,3],[.99,.55,2.1,9],[.03,.45,2.0,3],[.06,.92,2.2,5],[.96,.95,2.1,3],[.18,.98,1.9,9],[.82,1.0,1.9,5],[.40,.02,2.0,9]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  rootTree(u,v,s*.95,seed);
 }
 for(const[u,v,s,seed]of[[.06,.24,4.0,3],[.97,.36,4.2,9],[.92,.05,3.8,5]])rootTree(u,v,s,seed);
 for(let i=0;i<90;i++){const[x,y,z]=onGround(R(.0,1.0),R(.12,.98));if(trailEdge(x,z)<M(.5)||field(x,z).rock>.25||(polyAt(PLAZA,x,z)??1)<M(.3))continue;fernClump(x,y-.05,z,M(R(.7,1.2)));}
 for(let i=0;i<1400;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5))continue;
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
 greatTree(.60,.17,6.5);rootArch(.13,.33,.30,.31,.15);
 burrow(.455,.375,.035);burrow(.58,.385,.035);burrow(.675,.425,.035);
 scatteredRocks();plantGrove();glowPlants();
 const ferns=new THREE.Mesh(mergeGeometries(fernParts),paint({vertexColors:true,shade:[.5,.62,.5],mid:[.86,.95,.8]}));ferns.material.side=THREE.DoubleSide;ferns.receiveShadow=true;scene.add(ferns);
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c5452')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
