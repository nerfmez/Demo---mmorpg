// Old Root Stone Ring: on a mound above a plaza, a ring of tall weathered standing stones round a
// paved circle and a broken moon altar, great old trees behind it with their roots over the mound.
// A stone stair climbs the mound's face; paths curve round both sides.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
function ringStones(){
 // the ring: tall stones round the paved circle, as the reference's [u, foot v, width, top v]
 for(const a of[[.415,.30,.035,.21],[.455,.38,.03,.31],[.50,.27,.03,.21],[.62,.235,.035,.06],[.70,.27,.035,.17],[.765,.32,.035,.25],[.53,.10,.045,.06],[.31,.30,.04,.23],[.725,.42,.03,.35]])standingStone(...a);
 // the mound's face: big mossy blocks over the plaza, broken by the stair
 for(const[u,v,w,h]of[[.36,.50,.06,.10],[.42,.55,.06,.10],[.48,.58,.05,.09],[.62,.62,.06,.10],[.68,.61,.05,.09],[.33,.42,.05,.08]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.3)continue;
  fieldStone(x,y-M(.3),z,width,hh+M(.3),width*R(.7,.85),{ry:R(-.3,.3),moss:.6,base:pick(MOON_STONE),chamfer:.35});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<2;k++)addBush(x+R(-.5,.5)*width,y+hh*R(.6,1),z+R(-.2,.2)*width,M(R(.3,.45)),{sy:.6,tint:R(-.1,.2)});
 }
}
function scatteredRocks(){
 for(const[u,v,w,h]of[[.05,.62,.07,.09],[.13,.68,.05,.06],[.20,.80,.05,.07],[.84,.82,.07,.10],[.90,.88,.06,.08],[.05,.20,.04,.06],[.95,.30,.04,.06],[.24,.95,.06,.07],[.72,.97,.06,.06],[.66,.70,.03,.03]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5||(polyAt(PLAZA,x,z)??1)<0)continue;
  fieldStone(x,y-M(.25),z,width*R(.8,.95),hh+M(.25),width*R(.65,.8),{ry:R(-.9,.9),moss:.6,base:pick(MOON_STONE),chamfer:.4});COLLIDERS.push({x,z,r:width*.4});
 }
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.10,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantRing(){
 const trees=[[.06,.10,2.2,9],[.16,.04,2.1,5],[.97,.08,2.2,3],[.99,.55,2.1,9],[.02,.45,2.0,3],[.06,.92,2.2,5],[.95,.95,2.1,3],[.18,.98,1.9,9],[.82,1.0,1.9,5],[.62,.03,2.0,9]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  rootTree(u,v,s*.95,seed);
 }
 // the great old trees behind the ring, their roots spreading over the mound (the region concept's giant)
 for(const[u,v,s,seed]of[[.385,.12,4.6,5],[.80,.12,4.4,9],[.06,.30,3.8,3],[.97,.70,3.6,5]])rootTree(u,v,s,seed);
 for(let i=0;i<1500;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5)||ALTAR&&Math.hypot(x-ALTAR.x,z-ALTAR.z)<M(3.2))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||ALTAR&&Math.hypot(x-ALTAR.x,z-ALTAR.z)<M(2.6))continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
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
 const[x,z]=P(.50,.86);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 moonAltar(.585,.305);{const[cx,cz]=P(.585,.33,PL);pavedCircle(cx,cz,ALTAR.r*1.15,ALTAR.r*2.05);}
 ringStones();scatteredRocks();plantRing();glowPlants();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c5452')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
