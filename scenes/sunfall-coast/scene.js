// Sunfall Coast (Greenhollow Frontier): a wide earth clearing beside a sand beach; a pale sea cliff
// over the beach springs a great rock arch whose far leg stands in the sea; sea stacks off the sand;
// rock tiers up the left, a stone stair climbing them to the top path. Paths leave south, north-west
// at the top, west along the foot of the tiers, and south-east along the shore.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>SEA_FLOOR;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
// the sand beach: from the waterline up to the clearing's earth (the ground shader draws it)
const onSand=(x,z)=>seaDist(x,z)>-M(2.3);
// a palm on something higher than the ground (the arch's top)
function palmOn(x,y,z,o){const h0=height;height=()=>y+.1;try{palm(x,z,o);}finally{height=h0;}}
function coastRocks(){
 // mossy boulders round the clearing and at the cliff's foot: [u, foot v, width, top v]
 for(const[u,v,w,h]of[[.555,.495,.03,.465],[.60,.525,.022,.505],[.53,.47,.025,.45],[.635,.475,.03,.44],[.585,.585,.018,.57],[.605,.645,.03,.61],[.63,.71,.015,.695],[.30,.635,.04,.585],[.33,.70,.035,.66],[.335,.79,.03,.755],[.575,.97,.025,.94],[.64,.885,.022,.86],[.70,.975,.03,.94],[.61,1.0,.02,.98],[.40,.45,.03,.41],[.36,.47,.025,.445],[.075,.48,.035,.43],[.23,.50,.03,.465]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,h);
  {const st=stairsAt(x,z);if(st.s<st.half*.5)continue;}
  fieldStone(x,y-M(.25),z,width*R(.85,1),hh+M(.25),width*R(.7,.9),{ry:R(-.5,.5),moss:.6,chamfer:.35});COLLIDERS.push({x,z,r:width*.42});
  if(rand()<.6)addBush(x+R(-.5,.5)*width,y,z+R(.2,.6)*width,M(R(.25,.4)),{sy:.6,tint:R(-.1,.2)});
 }
 // pebbles and small rocks: many along the sand's edge and in the shallows, as the concept's
 for(let i=0;i<420;i++){
  const[x,y,z]=onGround(R(.25,.98),R(.40,1.04)),sd=seaDist(x,z),f=field(x,z);
  if(f.rock>.2||stairsAt(x,z).inside)continue;
  if(sd<-M(4.5)&&rand()<.75)continue;
  const r=sd>-M(1.5)?R(.25,.7):R(.08,.32);addStone(x,y-.08,z,r*1.5,r,r*1.1,{extra:5,chamfer:.26,noLine:r<.3,moss:sd>0?.25:.06,base:pick(ruinPalette)});
 }
}
// ivy and shrubs on the sea cliff's face, as the concept's
function cliffIvy(){
 for(let i=0;i<260;i++){
  const u=R(.48,.70),v=R(.10,.46),[x,y,z]=onGround(u,v);
  if(y<M(.8)||y>CLIFF-M(.3)||field(x,z).rock<.3)continue;
  const n=vnoise2(u*9,v*7);if(n<.45)continue;
  addBush(x+R(-.2,.2),y-M(.1),z+M(.25),M(R(.22,.42)),{sy:R(.9,1.4),tint:R(-.2,.1)});
 }
}
const vnoise2=(a,b)=>.5+.25*Math.sin(a*1.7+b*.6)+.25*Math.sin(b*2.3-a*.9+1.2);
function plantCoast(){
 for(const[u,v,r]of[[.60,.97,.55],[.66,.95,.6],[.70,1.0,.5],[.56,.90,.4],[.63,.84,.35]]){const[x,y,z]=onGround(u,v);for(let k=0;k<3;k++)addBush(x+R(-1,1)*M(.4),y-.1,z+R(-1,1)*M(.3),M(r)*R(.8,1.1),{sy:R(.6,.8),tint:R(-.05,.2)});}
 for(const[u,v,s,seed]of[[.04,.13,3.6,5],[.12,.02,3.0,9],[.27,.03,3.0,3],[.42,.02,2.8,5],[.035,.42,3.2,9],[.06,.63,2.8,3],[.30,.40,2.4,5],[.22,.30,2.6,9],[.60,-.02,3.0,3],[.52,.08,2.4,9],[.36,.10,2.2,3],[.10,.25,2.8,3],[.62,.18,2.4,5],[.03,.96,2.6,9],[.30,.94,2.2,5]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6))||onSand(x,z))continue;
  broadleaf(x,z,s*.8,seed);COLLIDERS.push({x,z,r:s*.3});
 }
 // palms: on the cliff top, on the arch's far shoulder, leaning off the middle tier and a low one at the front left
 for(const[u,v,h,dir,lean]of[[.575,.06,M(2.4),-1.2,M(.5)],[.185,.40,M(2.3),-.4,M(1.3)],[.145,.80,M(1.1),-2.4,M(.3)]]){const[x,,z]=onGround(u,v);palm(x,z,{h,dir,lean,fronds:9,droop:.8});COLLIDERS.push({x,z,r:.6});}
 {const A=ARCH,t=.12,th=Math.PI*t,along=A.a*Math.cos(th),x=A.cx+(A.x1-A.x0)/(2*A.a)*along,z=A.cz+(A.z1-A.z0)/(2*A.a)*along,y=SEA_Y+A.b*Math.sin(th)+A.thick*.5;palmOn(x,y,z,{h:M(2.4),dir:-.3,lean:M(.6),fronds:9,droop:.8});}
 for(let i=0;i<2000;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.6))||onSand(x,z)||y<-.3)continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  const f=field(x,z),edge=trailEdge(x,z);
  if(f.top<.3&&edge<M(2.2)&&rand()<.75)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<8000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(y<-.3||onSand(x,z)||trailEdge(x,z)<.35||f.rock>.10)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.3)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#f7da54':'#fff6dc'});
 }
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...ruinPalette);
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.80);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 rockArch();seaStacks();cliffIvy();scene.add(buildSea());coastRocks();plantCoast();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 // palm trunks come indexed and with uvs: one layout before merging
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
