// Moonstone Camp: a clearing under a wooded rock terrace; two canvas tents, a campfire with log
// benches and the moonstone on its pedestal stand at the terrace's foot. Paths leave south, west,
// north up the left bank and north-east up a stone stair.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
function scatteredRocks(){
 // big mossy blocks round the clearing, as the reference's: [u, v, width, height] as screen fractions
 for(const[u,v,w,h]of[[.03,.44,.06,.09],[.12,.40,.05,.07],[.33,.88,.07,.08],[.32,.96,.06,.06],[.61,.88,.06,.07],[.69,.98,.06,.06],[.53,.12,.05,.07],[.60,.10,.04,.06],[.83,.36,.03,.04],[.91,.68,.05,.08],[.97,.63,.05,.09],[.08,.62,.04,.05],[.30,.62,.03,.04],[.72,.40,.025,.035],[.66,.37,.03,.04]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5||(polyAt(PLAZA,x,z)??1)<0)continue;
  addStone(x,y-M(.25),z,width*R(.7,.85),(hh+M(.25))*R(.75,.9),width*R(.6,.75),{extra:9,chamfer:.12,jitter:.13,moss:.6,base:pick(MOON_STONE),ry:R(-.9,.9)});COLLIDERS.push({x,z,r:width*.4});
 }
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.10,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.12});
 }
}
function campClutter(){
 // big mossy blocks before and on the rock wall at varied heights, as the reference's alcove
 for(const[u,v,w,h]of[[.255,.30,.07,.13],[.29,.24,.05,.10],[.41,.215,.05,.07],[.585,.24,.06,.15],[.62,.21,.04,.09],[.74,.33,.06,.11],[.785,.28,.05,.10],[.70,.255,.04,.07],[.47,.22,.035,.05]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  block(x,y-M(.3),z,width,hh+M(.3),width*R(.7,.9),R(-.25,.25),.7,{base:pick(MOON_STONE)});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<3;k++)addBush(x+R(-.5,.5)*width,y+R(0,.2)*hh,z+width*R(.3,.6),M(R(.3,.5)),{sy:.65,tint:R(-.1,.2)});
  addBush(x,y+hh-M(.15),z,width*.35,{sy:.5,tint:R(-.15,.1)});
 }
 // more of the camp's gear: barrels, a rolled bedroll, a cooking pot on the fire's edge, a log pile
 for(const[u,v]of[[.735,.395],[.75,.41]]){const[x,z]=P(u,v,0),y=height(x,z),g=new THREE.CylinderGeometry(M(.2),M(.22),M(.55),10);g.translate(x,y+M(.275),z);campParts.push(coloredPart(g,'#8f6b45'));for(const f of[.2,.8]){const h=new THREE.CylinderGeometry(M(.215),M(.215),M(.05),10,1,true);h.translate(x,y+M(.55)*f,z);campParts.push(coloredPart(h,'#5c5b52'));}COLLIDERS.push({x,z,r:M(.24)});}
 {const[x,z]=P(.355,.395,0),y=height(x,z),g=new THREE.CylinderGeometry(M(.14),M(.14),M(.7),9);g.rotateZ(Math.PI/2);g.rotateY(.4);g.translate(x,y+M(.14),z);canvasParts.push(coloredPart(g,'#6f8a76'));}
 {const[x,z]=P(.505,.37,0),y=height(x,z),g=new THREE.SphereGeometry(M(.18),10,7,0,Math.PI*2,Math.PI*.35,Math.PI*.65);g.translate(x,y+M(.2),z);campParts.push(coloredPart(g,'#3e3d3a'));}
 firewood(.76,.37);
}
const CAMP=[[.335,.435,.335,.205],[.505,.58,.325,.245]];
function plantCamp(){
 // the deep teal grove round the clearing, old rooted trees on the terrace and the banks
 const trees=[[.13,.06,2.2,9],[.50,.08,2.3,9],[.80,.03,2.1,5],[.99,.30,2.2,3],[.97,.50,2.1,5],[.03,.55,2.1,9],[.06,.90,2.2,3],[.95,.92,2.2,5],[.20,.98,1.9,9],[.84,1.0,1.9,3],[.26,.22,1.9,5],[.75,.20,2.0,9]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  rootTree(u,v,s*.95,seed);
 }
 // giants: Moonroot's great old trees (owner: some trees big, and Moonroot has many)
 for(const[u,v,s,seed]of[[.04,.14,4.2,9],[.70,.07,4.4,3],[.97,.12,4.0,5],[.02,.70,3.8,3],[.99,.80,3.9,9],[.30,.06,3.6,5]])rootTree(u,v,s,seed);
 for(let i=0;i<1500;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5)||inCamp(x,z,M(1.2)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||inCamp(x,z,M(.4)))continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.3)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#fff6dc':'#f7da54'});
 }
}
function inCamp(x,z,pad){
 for(const[u0,u1,v]of CAMP){const[cx,cz]=P((u0+u1)/2,v-.03,0),r=wide(u0,u1,v,0)*.75;if(Math.hypot(x-cx,z-cz)<r+pad)return true;}
 return MOONSTONE&&Math.hypot(x-MOONSTONE.x,z-MOONSTONE.z)<M(1)+pad||FIRE&&Math.hypot(x-FIRE.x,z-FIRE.z)<M(1.2)+pad;
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
 tent(...CAMP[0],.55);tent(...CAMP[1],-.35);banner(.585,.33,.255);
 campfire(.482,.39);logBench(.43,.41,.25);logBench(.54,.40,-.35);
 const w=crate(.30,.38,1.0);crate(.301,.38,.8,w);crate(.325,.40,.85);firewood(.455,.35);crate(.555,.355,.7);
 warpPillar(.645,.33);campClutter();
 scatteredRocks();plantCamp();glowPlants();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const canvas=new THREE.Mesh(mergeGeometries(canvasParts),paint({vertexColors:true,shade:[.62,.62,.66],mid:[.9,.9,.88]}));canvas.material.side=THREE.DoubleSide;canvas.castShadow=canvas.receiveShadow=true;scene.add(canvas);
 const wood=new THREE.Mesh(mergeGeometries(campParts),paint({vertexColors:true,shade:[.55,.5,.5],mid:[.86,.8,.74]}));wood.castShadow=wood.receiveShadow=true;scene.add(wood);
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c5452')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){updateWarp(t);if(FIRE&&!reduce){const k=1+.08*Math.sin(t*9)+.05*Math.sin(t*14.3);FIRE.flame.children[0].scale.set(1,k,1);FIRE.flame.children[1].scale.set(1,1+.1*Math.sin(t*11+1),1);}}
