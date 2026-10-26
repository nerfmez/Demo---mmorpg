// Mirror Pond: a still pond in a ring of mossy stone under willows and old rooted trees; stepping
// stones lead across it to a stair up the rock rim and the moon gate on the high ground behind.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>SEA_FLOOR;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(SEA_FLOOR,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
function scatteredRocks(){
 // big mossy blocks round the clearing, as the reference's: [u, v, width, height] as screen fractions
 for(const[u,v,w,h]of[[.05,.47,.06,.08],[.11,.50,.05,.06],[.20,.60,.05,.07],[.25,.66,.04,.05],[.89,.60,.05,.07],[.93,.66,.05,.08],[.86,.20,.04,.06],[.90,.13,.05,.08],[.06,.15,.04,.06],[.24,.90,.06,.07],[.30,.95,.05,.06],[.52,.97,.05,.05],[.66,.40,.025,.04],[.80,.74,.03,.04],[.13,.32,.03,.05],[.36,.33,.03,.045]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5||pondIn(x,z)>-width*.3)continue;
  addStone(x,y-M(.25),z,width*R(.7,.85),(hh+M(.25))*R(.75,.9),width*R(.6,.75),{extra:9,chamfer:.12,jitter:.13,moss:.6,base:pick(MOON_STONE),ry:R(-.9,.9)});COLLIDERS.push({x,z,r:width*.4});
 }
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.10,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||pondIn(x,z)>-M(.3))continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantGrove(){
 // the overview's deep teal grove: big rooted trees all round, two willows over the water
 const trees=[[.03,.18,2.3,3],[.10,.06,2.2,9],[.20,.10,2.1,5],[.36,.03,2.1,3],[.58,.03,2.2,9],[.80,.06,2.1,5],[.94,.10,2.3,3],[.99,.30,2.2,9],[.97,.48,2.1,5],[.02,.34,2.0,9],[.03,.62,2.1,3],[.08,.80,2.2,5],[.94,.86,2.2,9],[.99,.70,2.0,3],[.16,.97,1.8,9],[.84,.98,1.9,5]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  rootTree(u,v,s*.95,seed);
 }
 // the great tree on the rim behind the islet, its roots over the face into the water
 rootTree(.625,.175,2.4,5,true);rootTree(.22,.255,1.9,9,true);
 willow(.30,.235,1.0);willow(.69,.11,1.1);
 for(let i=0;i<1500;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(pondIn(x,z)>-M(.35)||trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5)||(MOON&&Math.hypot(x-MOON.x,z-MOON.z)<MOON.r*2))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(pondIn(x,z)>-M(.2)||trailEdge(x,z)<.35||f.rock>.10)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.3)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.75?'#fff6dc':'#f7da54'});
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
 const[x,z]=P(.50,.82);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();scene.add(moonGate());
 steppingStones();shoreStones();seaRocks.push(...STEP_STONES.slice(0,8).map(s=>[s.x,s.z,s.r]));while(seaRocks.length<8)seaRocks.push([0,-999,0]);
 scene.add(buildSea());lilyPads();scatteredRocks();plantGrove();glowPlants();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),paint({vertexColors:true,shade:[.55,.5,.5],mid:[.86,.8,.74]}));roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c5452')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
const seaRocks=[];
function updateAmbience(t){}
