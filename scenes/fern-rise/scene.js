// Fern Rise: a mossy rock rise in the middle of a clearing, giant fiddlehead ferns coiling on its
// top among broad fern fronds; paths wind up both sides to the high ground, old rooted trees round.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
function riseFace(){
 // big mossy blocks along the faces of the rise and the banks, as the reference's
 for(const[u,v,w,h]of[[.43,.46,.06,.11],[.49,.51,.06,.10],[.56,.52,.06,.11],[.62,.50,.05,.10],[.67,.47,.05,.09],[.41,.38,.04,.07],[.14,.43,.06,.10],[.09,.50,.06,.09],[.18,.22,.05,.09],[.18,.13,.04,.07],[.92,.40,.05,.09],[.95,.65,.06,.10],[.90,.66,.04,.07],[.36,.14,.05,.08],[.48,.17,.05,.08],[.70,.15,.05,.08]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.3)continue;
  fieldStone(x,y-M(.3),z,width,hh+M(.3),width*R(.7,.85),{ry:R(-.3,.3),moss:.6,base:pick(MOON_STONE),chamfer:.35});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<2;k++)addBush(x+R(-.5,.5)*width,y+hh*R(.5,1),z+R(-.2,.2)*width,M(R(.3,.45)),{sy:.6,tint:R(-.1,.2)});
 }
}
function scatteredRocks(){
 for(const[u,v,w,h]of[[.15,.63,.06,.07],[.20,.72,.04,.05],[.36,.73,.03,.04],[.45,.55,.04,.05],[.73,.65,.04,.05],[.86,.62,.04,.05],[.30,.97,.05,.06],[.72,.95,.06,.07],[.06,.74,.05,.07],[.95,.86,.06,.08]]){
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
function plantFerns(){
 // the giant fiddleheads on the rise, as the reference's: [u, foot v, top v, facing, lean]
 fiddlehead(.545,.30,.05,0,.04,1.45);fiddlehead(.625,.32,.16,0,.02,1.35);fiddlehead(.505,.27,.15,Math.PI,.03,1.25);fiddlehead(.66,.30,.21,Math.PI,0,1.3);fiddlehead(.59,.36,.28,0,.02,1.2);
 // broad fern clumps on the rise and along the banks and path edges
 for(let i=0;i<140;i++){
  const[x,y,z]=onGround(R(.0,1.0),R(.12,.98));
  if(trailEdge(x,z)<M(.5)||field(x,z).rock>.25||(polyAt(PLAZA,x,z)??1)<M(.3))continue;
  fernClump(x,y-.05,z,M(R(.7,1.2)));
 }
 // the rise's top is a thicket of ferns and bushes round the fiddleheads
 for(let i=0;i<34;i++){const[x,y,z]=onGround(R(.40,.72),R(.18,.46));if(field(x,z).rock>.25)continue;fernClump(x,y-.05,z,M(R(.9,1.5)));}
 for(let i=0;i<60;i++){const[x,y,z]=onGround(R(.40,.72),R(.18,.48));if(field(x,z).rock>.3)continue;addBush(x,y-.1,z,M(R(.35,.6)),{sy:R(.55,.8),tint:R(-.05,.2)});}
}
function plantGrove(){
 const trees=[[.06,.10,2.2,9],[.30,.03,2.1,5],[.97,.08,2.2,3],[.99,.55,2.1,9],[.02,.40,2.0,3],[.06,.92,2.2,5],[.95,.95,2.1,3],[.18,.98,1.9,9],[.82,1.0,1.9,5],[.56,.02,2.0,9]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  rootTree(u,v,s*.95,seed);
 }
 // great old trees, as the reference's on both sides and the region's
 for(const[u,v,s,seed]of[[.40,.08,4.2,5],[.97,.30,4.4,9],[.05,.20,4.0,3],[.72,.06,3.6,9]])rootTree(u,v,s,seed);
 for(let i=0;i<1300;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10)continue;
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
 const[x,z]=P(.50,.84);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 riseFace();scatteredRocks();plantFerns();plantGrove();glowPlants();
 const ferns=new THREE.Mesh(mergeGeometries(fernParts),paint({vertexColors:true,shade:[.5,.62,.5],mid:[.86,.95,.8]}));ferns.material.side=THREE.DoubleSide;ferns.castShadow=ferns.receiveShadow=true;scene.add(ferns);
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c5452')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
