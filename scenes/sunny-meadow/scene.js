// Sunny Meadow (Greenhollow Frontier): a level meadow in warm sun, a sundial on a round stone dais
// in its middle with weathered posts round it, low shelves of mossy rock between the earth paths,
// big oaks and white and yellow flowers. The path from the south splits below the dial: west
// round the big oak, north-west up the left side, east round the right.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
const nearDial=(x,z,pad)=>DIAL&&Math.hypot(x-DIAL.x,z-DIAL.z)<DIAL.r*1.35+pad;
function meadowRocks(){
 // the concept's loose boulders: [u, foot v, width, top v]
 for(const[u,v,w,h]of[[.405,.45,.03,.035],[.465,.445,.025,.03],[.43,.40,.02,.025],[.66,.56,.03,.035],[.70,.57,.025,.03],[.62,.52,.02,.025],[.30,.90,.03,.025],[.80,.86,.03,.025],[.66,.60,.035,.045],[.73,.08,.04,.07],[.46,.08,.03,.05],[.55,.06,.03,.05],[.88,.26,.03,.05],[.03,.24,.04,.06],[.10,.43,.03,.04]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(!offPath(x,z,width*.5+M(.3))||nearDial(x,z,width))continue;
  fieldStone(x,y-M(.25),z,width*R(.85,1),hh+M(.25),width*R(.7,.85),{ry:R(-.9,.9),moss:.55,chamfer:.35});COLLIDERS.push({x,z,r:width*.42});
  for(let k=0;k<2;k++)if(rand()<.7)addBush(x+R(-.6,.6)*width,y,z+R(.1,.6)*width,M(R(.22,.36)),{sy:.6,tint:R(-.1,.2)});
 }
 // pebbles along the path edges and in the grass
 for(let i=0;i<220;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.08,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||nearDial(x,z,0))continue;
  const r=R(.08,.34);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantMeadow(){
 // oaks: [u, v, size, seed]; the big one beside the dial, the rest framing the meadow
 // [u, v] is the trunk's foot in the concept
 for(const[u,v,s,seed]of[[.305,.555,4.4,5],[.265,.20,3.8,9],[.05,.18,3.2,3],[.13,.06,2.8,5],[.42,.10,3.2,9],[.745,.085,3.4,3],[.60,.04,2.8,5],[.955,.21,3.2,9],[.875,.445,2.6,3],[.985,.66,2.4,5],[.35,.03,2.4,3],[.86,.02,2.6,9],[.96,1.0,2.6,3],[.03,1.0,2.6,9]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6)))continue;
  rootTree(u,v,s*.8,seed);
 }
 // shrubs round the rock shelves and the field's edges, never on the paths, the apron or the dais
 for(let i=0;i<1700;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.6))||nearDial(x,z,M(.6)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  // the open meadow round the dial stays grass: shrubs gather on the shelves and at the edges
  const f=field(x,z);if(f.top<.3&&shadeAt(x,z)<.3&&rand()<.8||f.top>.3&&rand()<.8)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 // grass and the concept's white daisies and yellow flowers, thickest along the front shelves
 for(let i=0;i<8000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||nearDial(x,z,M(.2)))continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  const front=vOf(x,y,z)>.62?.75:.25;
  if(rand()<front)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f7da54'});
 }
}
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||nearDial(item.x,item.z,-.2)||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.84);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 dialPosts(sundial(.60,.315));
 meadowRocks();plantMeadow();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
