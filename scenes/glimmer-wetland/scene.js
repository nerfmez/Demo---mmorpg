// Glimmer Wetland (Greenhollow Frontier): an earth path forks between four clear turquoise pools edged
// with mossy stone blocks, lily pads and white-plumed reeds; great weeping willows lean over them; a
// glowing crystal stands on a rock at the back and glints twinkle over the water. Paths leave south,
// west, north, east and north-east.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>SEA_FLOOR;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(SEA_FLOOR,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
function wetRocks(){
 // big mossy blocks along the path edges and on the banks, as the concept's: [u, foot v, width, top v]
 for(const[u,v,w,h]of[[.03,.33,.05,.30],[.09,.31,.04,.285],[.26,.48,.03,.46],[.30,.49,.025,.47],[.375,.62,.03,.60],[.41,.66,.025,.645],[.66,.62,.04,.595],[.72,.585,.035,.56],[.78,.61,.04,.585],[.755,.70,.035,.675],[.83,.69,.03,.665],[.15,.68,.035,.655],[.08,.66,.04,.63],[.25,.84,.04,.81],[.30,.88,.035,.855],[.70,.95,.045,.915],[.78,.92,.035,.89],[.86,.97,.045,.935],[.60,.17,.03,.145],[.38,.06,.035,.03],[.25,.07,.03,.045],[.68,.36,.02,.345]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,h);
  {const st=stairsAt(x,z);if(st.s<st.half+width*.3||pondIn(x,z)>-width*.3)continue;}
  block(x,y-M(.25),z,width*R(.9,1.05),hh+M(.25),width*R(.6,.8),R(-.4,.4),.65,{base:pick(SHORE_STONE)});COLLIDERS.push({x,z,r:width*.42});
  if(rand()<.6)addBush(x+R(-.4,.4)*width,y+hh*.3,z+R(.3,.6)*width,M(R(.25,.4)),{sy:.6,tint:R(-.1,.2)});
 }
 for(let i=0;i<200;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.08,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||pondIn(x,z)>-M(.3))continue;
  const r=R(.08,.3);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.1});
 }
}
function plantWetland(){
 // the great willows, as the concept's: top left, top middle on its rock, top right and the right edge
 willow(.08,.24,1.45);willow(.45,.19,1.55);willow(.915,.19,1.4);willow(.975,.72,1.5);
 for(const[u,v,s,seed]of[[.03,.04,2.6,5],[.27,.02,2.4,9],[.70,-.02,2.6,3],[.80,.04,2.2,9],[.02,.55,2.2,3],[.03,.86,2.4,9],[.18,.97,2.2,5],[.92,.98,2.2,3],[.99,.40,2.2,5]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6))||pondIn(x,z)>-M(1))continue;
  rootTree(u,v,s*.8,seed);
 }
 for(let i=0;i<1000;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.6))||pondIn(x,z)>-M(.6))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  const f=field(x,z),edge=trailEdge(x,z);
  if(f.top<.3&&edge<M(1.8)&&rand()<.6)continue;
  addBush(x,y-.1,z,R(.6,1.2),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<9000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(pondIn(x,z)>-M(.15)||trailEdge(x,z)<.3||f.rock>.10)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  // yellow and white flowers all over the grass, thickest along the paths, as the concept's
  if(rand()<(trailEdge(x,z)<M(2.5)?.7:.4))flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.55?'#f7da54':'#fff6dc'});
 }
 for(let i=0;i<60;i++){const[x,,z]=onGround(R(0,1),R(.1,1));if(offPath(x,z,M(.5))&&pondIn(x,z)<-M(.5)&&field(x,z).rock<.2&&rand()<.5)reedClump(x,z,R(.7,.95));}
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...SHORE_STONE);
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.78);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 shoreBlocks();poolPebbles();while(seaRocks.length<8)seaRocks.push([0,-999,0]);
 scene.add(buildSea());lilyPads();crystal(.715,.12);wetRocks();plantWetland();reeds();sparkles();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
const seaRocks=[];
function updateAmbience(t){for(const g of glints){const k=Math.max(0,Math.sin(t*g.rate*2.2+g.ph));g.sp.material.opacity=k*k;g.sp.scale.setScalar(g.s*(.5+.6*k));}}
