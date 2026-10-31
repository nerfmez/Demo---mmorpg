// Crag Highlands (Greenhollow Frontier): a grassy clearing with an earth path among tall columned crags;
// a path climbs north-west up the gully, a stone stair climbs to the brazier shrine on the high shelf
// with its weathered pillars, the east path runs past a ruined wall, a path leaves west. Birches on
// the crags, shrubs, white and yellow flowers, mossy rocks.
function onGround(u,v){
 let hi=M(9),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
const nearShrine=(x,z,pad)=>BRAZIER&&Math.hypot(x-BRAZIER.x,z-BRAZIER.z)<M(2.6)+pad;
function cragRocks(){
 // mossy boulders round the clearing and the crags' feet, as the concept's: [u, foot v, width, top v]
 for(const[u,v,w,h]of[[.25,.47,.04,.42],[.34,.52,.035,.48],[.545,.54,.03,.51],[.65,.505,.025,.48],[.18,.66,.04,.62],[.27,.70,.035,.665],[.33,.66,.03,.635],[.32,.89,.04,.85],[.12,.58,.035,.545],[.57,.60,.02,.585],[.52,.42,.025,.395],[.47,.53,.02,.51],[.72,.50,.03,.47],[.85,.48,.03,.45],[.90,.53,.025,.51],[.64,.88,.035,.85]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,h);
  {const st=stairsAt(x,z);if(st.s<st.half*.5)continue;}
  fieldStone(x,y-M(.3),z,width*R(.85,1),hh+M(.3),width*R(.7,.9),{ry:R(-.5,.5),moss:.65,chamfer:R(.35,.55)});COLLIDERS.push({x,z,r:width*.42});
  if(rand()<.6)addBush(x+R(-.5,.5)*width,y,z+R(.3,.6)*width,M(R(.25,.4)),{sy:.6,tint:R(-.1,.2)});
 }
 for(let i=0;i<220;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.08,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||nearShrine(x,z,0))continue;
  const r=R(.08,.3);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.3,noLine:true,moss:.12});
 }
}
function plantCrags(){
 birch(.065,.27,2.2,3);birch(.42,.17,2.3,9);birch(.95,.43,2.2,5);
 for(const[u,v,s,seed]of[[.13,.02,3.0,5],[.03,.10,2.8,9],[.33,.0,2.6,3],[.90,.04,3.0,9],[.99,.22,2.6,5],[.23,.17,2.2,5],[.85,.20,2.2,3]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6))||nearShrine(x,z,M(1)))continue;
  rootTree(u,v,s*.8,seed);
 }
 for(let i=0;i<1600;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.6))||nearShrine(x,z,M(.3)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  const f=field(x,z),edge=trailEdge(x,z);
  if(f.top<.3&&edge<M(2.4)&&rand()<.7)continue;
  addBush(x,y-.1,z,R(.6,1.25),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<9000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||nearShrine(x,z,0))continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.32)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f7da54'});
 }
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...ruinPalette);
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||nearShrine(item.x,item.z,-M(.6))||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.83);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 shrine(.69,.165);ruinedWall();cragRocks();plantCrags();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 if(birchParts.length){const b=new THREE.Mesh(mergeGeometries(birchParts),paint({vertexColors:true,shade:[.62,.62,.7],mid:[.88,.88,.9]}));b.castShadow=b.receiveShadow=true;scene.add(b);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){
 for(const f of flames){
  if(f.glow){f.glow.material.opacity=.62+.12*Math.sin(t*7.3)+.06*Math.sin(t*13.1);continue;}
  const k=1+.12*Math.sin(t*9+f.ph)+.07*Math.sin(t*15.7+f.ph*2);f.m.scale.set(1+.06*Math.sin(t*11+f.ph),k,1+.06*Math.cos(t*10+f.ph));f.m.rotation.y=t*.8+f.ph;
 }
}
