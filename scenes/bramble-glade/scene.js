// Bramble Glade (Greenhollow Frontier): a sunny earth clearing among rock shelves overgrown with
// flowering bramble. A brambled rock island stands in the middle with a tree on it; the path from
// the south opens into the clearing below it, one path climbs north-west to a short flight of steps,
// one runs north under an arch of twisted bramble, and one curves away east.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
const underArch=(x,z,pad)=>ARCH&&Math.hypot(x-(ARCH.ax+ARCH.bx)/2,z-(ARCH.az+ARCH.bz)/2)<Math.hypot(ARCH.bx-ARCH.ax,ARCH.bz-ARCH.az)/2+pad;
function gladeRocks(){
 // the concept's boulders: [u, foot v, width, top v]
 for(const[u,v,w,h]of[[.255,.775,.09,.075],[.24,.92,.06,.06],[.42,.49,.045,.05],[.665,.965,.06,.05],[.735,.99,.06,.05],[.47,.52,.025,.02],[.60,.13,.035,.05],[.95,.55,.03,.04],[.13,.10,.03,.05]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(!offPath(x,z,width*.45))continue;
  fieldStone(x,y-M(.25),z,width*R(.9,1),hh+M(.25),width*R(.75,.9),{ry:R(-.5,.5),moss:.65,chamfer:.32});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<2;k++)if(rand()<.6)bramble(x+R(-.6,.6)*width,y,z+R(.2,.6)*width,R(.6,.9));
 }
 for(let i=0;i<180;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.08,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside)continue;
  const r=R(.08,.3);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function plantGlade(){
 // trees: [u, trunk foot v, size, seed]
 for(const[u,v,s,seed]of[[.075,.22,3.6,5],[.20,.04,3.0,9],[.37,.03,2.8,3],[.555,.235,3.6,9],[.64,.03,3.0,5],[.53,.02,2.6,3],[.89,.0,3.0,9],[.985,.20,2.8,3],[.03,.02,2.8,9],[.72,.10,2.4,5]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6))||underArch(x,z,M(1)))continue;
  rootTree(u,v,s*.8,seed);
 }
 // bramble: thick on the shelves, round the rocks and along the field's edges, starred with roses
 for(let i=0;i<2200;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.7))||underArch(x,z,M(.4)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  const f=field(x,z),edge=trailEdge(x,z);
  // the open grass beside the paths stays clear; bramble gathers on the shelves and the field's edges
  if(f.top<.3&&edge<M(2.2)&&rand()<.6)continue;
  if(rand()<.7)bramble(x,y,z,R(.7,1.25));else addBush(x,y-.1,z,R(.7,1.3),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 // grass, white flowers in the grass and fallen petals' pink
 for(let i=0;i<8000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.3)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f4c9d4'});
 }
}
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
 // nothing grows in the arch's opening, where the north path passes
 for(let i=roseItems.length-1;i>=0;i--){const r=roseItems[i],st=stairsAt(r.x,r.z);if(st.s<st.half+.2&&r.y-st.y<M(1.2))roseItems.splice(i,1);}
}
function build(){
 const[x,z]=P(.50,.84);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 brambleArch(.775,.245,.925,.22,.03);
 gladeRocks();plantGlade();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();placeRoses();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
