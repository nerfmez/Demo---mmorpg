// Greyfang Den (Greenhollow Frontier): a wide earth clearing in front of a tall mass of mossy rock
// with the wolf den's cave in its face, a tunnel that can be walked into; a fallen log, a skull and bones by the mouth; tall
// weathered rock pillars round the clearing; a stone stair up the left bank. Paths leave west,
// north-west up the stair, north-east round the rock mass and south-east.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
const nearCave=(x,z,pad)=>{if(!CAVE)return false;const dx=CAVE.bx-CAVE.ax,dz=CAVE.bz-CAVE.az,t=Math.max(0,Math.min(1,((x-CAVE.ax)*dx+(z-CAVE.az)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-CAVE.ax-dx*t,z-CAVE.az-dz*t)<CAVE.w*.75+pad;};
function denRocks(){
 // tall weathered pillars and boulders, the concept's: [u, foot v, width, top v]
 for(const[u,v,w,h]of[[.235,.575,.065,.115],[.31,.57,.05,.07],[.385,.405,.05,.08],[.265,.39,.045,.085],[.345,.255,.06,.13],[.16,.21,.045,.075],[.035,.19,.04,.07],[.585,.385,.03,.03],[.665,.43,.025,.025],[.69,.60,.045,.045],[.655,.615,.03,.025],[.73,.40,.04,.05],[.795,.415,.03,.03],[.765,.385,.035,.04],[.705,.385,.025,.025],[.11,.70,.06,.08],[.19,.87,.06,.09],[.27,.80,.05,.07],[.73,.86,.07,.09],[.86,.80,.06,.08],[.96,.66,.05,.08],[.95,.55,.04,.05]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  // the clearing's boulders may stand at the earth's edge, as the concept's do
  {const st=stairsAt(x,z);if(st.s<st.half*.45||(polyAt(PLAZA,x,z)??1)<-width*.3||nearCave(x,z,0))continue;}
  fieldStone(x,y-M(.3),z,width*R(.9,1),hh+M(.3),width*R(.75,.9),{ry:R(-.4,.4),moss:.7,chamfer:.3});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<2;k++)if(rand()<.7)addBush(x+R(-.6,.6)*width,y,z+R(.2,.6)*width,M(R(.28,.42)),{sy:.6,tint:R(-.1,.2)});
 }
 for(let i=0;i<200;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.08,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||nearCave(x,z,0))continue;
  const r=R(.08,.32);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantDen(){
 for(const[u,v,s,seed]of[[.035,.255,3.6,5],[.125,.20,3.0,9],[.38,.16,3.2,3],[.22,.03,3.0,5],[.36,.02,2.6,9],[.955,.33,3.6,9],[.97,.06,3.0,3],[.70,-.01,3.0,5],[.55,-.02,2.6,3],[.05,.47,2.6,9],[.86,.02,2.6,5],[.25,.31,2.4,3]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6))||nearCave(x,z,M(1)))continue;
  rootTree(u,v,s*.8,seed);
 }
 for(let i=0;i<1800;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.6))||nearCave(x,z,M(.5)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  const f=field(x,z),edge=trailEdge(x,z);
  if(f.top<.3&&edge<M(2.4)&&rand()<.7)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<8000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||nearCave(x,z,0))continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.22)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.75?'#fff6dc':'#f7da54'});
 }
}
// big blocks crowning the rock mass, the concept's broken skyline over the den
function denCrown(){
 for(const[u,v,w,h]of[[.53,.10,.07,.10],[.62,.05,.06,.09],[.72,.08,.05,.08],[.79,.06,.06,.10],[.85,.13,.05,.08],[.50,.20,.05,.07]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  fieldStone(x,y-M(.4),z,width,hh+M(.4),width*R(.75,.9),{ry:R(-.3,.3),moss:.7,chamfer:.3});
  for(let k=0;k<3;k++)addBush(x+R(-.7,.7)*width,y+hh*R(.4,1),z+R(-.3,.4)*width,M(R(.3,.5)),{sy:.6,tint:R(-.1,.2)});
 }
}
function bones(){
 const[sx,,sz]=onGround(.455,.365);skull(sx,sz,.6);
 for(const[u,v,len,ry]of[[.50,.37,.7,.4],[.53,.355,.55,-.9],[.62,.355,.6,.2],[.66,.37,.5,1.3],[.57,.38,.45,-.3],[.43,.385,.5,1.1]]){const[x,,z]=onGround(u,v);bone(x,z,M(len),ry);}
}
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||nearCave(item.x,item.z,-.4)||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.84);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 denInside(caveTunnel(.60,.325,.61,.17,M(4.4),M(3.4)));fallenLog(.40,.37,.52,.335);bones();denCrown();
 denRocks();plantDen();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
