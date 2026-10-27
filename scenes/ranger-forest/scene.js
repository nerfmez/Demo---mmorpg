// Coastal Ranger Forest: a watchtower over a dividing path, rock terraces and the sea below.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
function woodBox(x,y,z,w,h,d,color='#947748',ry=0){
 const m=new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry),new V3(1,1,1));
 woodParts.push(coloredPart(new THREE.BoxGeometry(w,h,d),color,m));
}
function woodBeam(a,b,width,color='#8c6c40'){
 const d=b.clone().sub(a),mat=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),d.clone().normalize()),new V3(1,1,1));
 woodParts.push(coloredPart(new THREE.BoxGeometry(width,d.length(),width),color,mat));
}
function fenceRun(points){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new V3(p[0],0,p[1])),false,'centripetal'),n=Math.max(2,Math.ceil(curve.getLength()/M(.72))),pts=curve.getSpacedPoints(n);
 const crossing=p=>{const st=stairsAt(p.x,p.z);return st.a>-.025&&st.a<1.035&&st.s<st.half+.52;};
 for(let i=0;i<pts.length;i++){
  const p=pts[i];if(crossing(p))continue;
  const y=height(p.x,p.z),h=M(.45),w=M(.075);
  woodBox(p.x,y+h/2,p.z,w,h,w,i%3?'#8d7345':'#a0874c');
  woodBox(p.x,y+h+.035,p.z,w*1.16,.08,w*1.16,'#c0a56a');
  COLLIDERS.push({x:p.x,z:p.z,r:w*.60});
  if(i){const q=pts[i-1];if(crossing(q)||crossing(p.clone().add(q).multiplyScalar(.5)))continue;const qy=height(q.x,q.z);for(const f of[.36,.78])woodBeam(new V3(q.x,qy+h*f,q.z),new V3(p.x,y+h*f,p.z),M(.044),f>.5?'#b49858':'#a1854c');COLLIDERS.push({seg:true,x:q.x,z:q.z,x1:p.x,z1:p.z,r:M(.04)});}
 }
}
function fences(){
 // along the top of the high bank behind the paths, from the stair head
 const top=[[.455,.222],[.50,.218],[.55,.216],[.60,.214],[.635,.205]].map(([u,v])=>P(u,v,PL+.1));
 fenceRun(top);
 // the clifftop rail on the seaward side of the coast path
 const route=ROUTES.find(r=>r.id==='coast'),pts=route.rows.filter((r,i)=>i%3===0).map(r=>{const side=seaDist(r.x+r.nx,r.z+r.nz)>seaDist(r.x-r.nx,r.z-r.nz)?1:-1;return[r.x+r.nx*side*(r.w/2+M(.3)),r.z+r.nz*side*(r.w/2+M(.3))];});
 if(pts.length>1)fenceRun(pts);
}
function towerProps(){
 // a supply crate and a barrel at the tower's foot, clear of the ladder and the stair head
 for(const[u,v,s]of[[.268,.262,.95],[.284,.258,.7]]){
  const[x,z]=P(u,v,PL),y=height(x,z);
  woodBox(x,y+s/2,z,s,s,s,'#a6814f',.2);woodBox(x,y+s*.88,z+s*.51,s,.09,.09,'#785c36',.2);
  COLLIDERS.push({x,z,r:s*.62});
 }
 const[x,z]=P(.222,.262,PL),y=height(x,z),g=new THREE.CylinderGeometry(.38,.42,.95,10);g.translate(x,y+.475,z);woodParts.push(coloredPart(g,'#967344'));
 for(const h of[.2,.73]){const r=new THREE.CylinderGeometry(.43,.43,.065,10,1,true);r.translate(x,y+h,z);woodParts.push(coloredPart(r,'#6f705c'));}
 COLLIDERS.push({x,z,r:.5});
}
// sea stacks off the coast: [u, v at the waterline, width as a screen fraction, top v]
const SEA_STACKS=[[.915,.152,.03,.118],[.865,.205,.022,.178],[.855,.255,.018,.235],[.885,.04,.022,.012],[.955,.075,.016,.058],[.825,.03,.016,.012]];
const seaRocks=[];
function seaStacks(){
 for(const[u,v,w,vt]of SEA_STACKS){
  const[x,z]=P(u,v,SEA_Y),width=wide(u-w/2,u+w/2,v,SEA_Y),h=tall(x,z,SEA_Y,vt)+M(.6);
  addStone(x,SEA_Y-M(.6),z,width,h,width*.8,{extra:13,chamfer:.22,moss:.28,base:pick(ruinPalette)});
  const[s,d]=seaQ(x,z);seaRocks.push([s,d,width*.55]);
 }
 while(seaRocks.length<8)seaRocks.push([0,-999,0]);
}
function scatteredRocks(){
 // big mossy blocks framing the front, as the reference's foreground: [u, v, width, height] as screen fractions
 for(const[u,v,w,h]of[[.61,.95,.055,.07],[.70,.895,.04,.05],[.765,.905,.06,.075],[.86,.84,.045,.06],[.925,.80,.03,.04],[.10,.745,.05,.07],[.235,.755,.045,.065],[.27,.845,.055,.07],[.225,.925,.045,.06]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  // sunk unevenly in the bank and leaning a little, with greenery at their feet
  addStone(x,y-M(.25),z,width*R(.8,1),hh*R(.7,.9)+M(.25),width*R(.6,.9),{extra:9,chamfer:.09,jitter:.13,moss:.5,base:pick(ruinPalette),ry:R(-.9,.9)});COLLIDERS.push({x,z,r:width*.45});
  for(let k=0;k<3;k++){const a=R(0,6.28),d=width*R(.45,.75),bx=x+Math.sin(a)*d,bz=z+Math.cos(a)*d;addBush(bx,height(bx,bz)-.1,bz,R(.7,1.1),{sy:R(.55,.8),tint:R(-.1,.1)});}
 }
 for(const[u,v,w,h]of[[.175,.585,.03,.04],[.135,.745,.035,.05],[.415,.80,.022,.032],[.37,.86,.026,.04],[.56,.83,.02,.03],[.72,.80,.02,.03],[.83,.73,.024,.035],[.59,.71,.02,.03],[.31,.555,.02,.03],[.47,.44,.018,.026],[.66,.46,.018,.026],[.96,.96,.04,.06]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5)continue;
  addStone(x,y-.08,z,width,hh,width*.73,{extra:13,chamfer:.22,moss:.38,base:pick(ruinPalette)});COLLIDERS.push({x,z,r:width*.4});
 }
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.24,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||y<-.5||Math.hypot(x-TOWER.x,z-TOWER.z)<TOWER.r*2)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.08});
 }
}
function plantForest(){
 // big broadleaf trees: the dense wood the reference frames everything with
 const trees=[[.04,.385,2.2,3],[.10,.17,2.2,9],[.19,.105,2.1,5],[.335,.13,2.0,3],[.37,.035,2.0,9],[.47,.085,2.2,5],[.54,.13,2.1,3],[.60,.05,2.1,9],[.665,.12,2.2,5],[.715,.235,2.0,3],[.80,.32,2.1,9],[.585,.445,2.2,5],[.535,.58,1.4,9],[.935,.465,2.4,9],[.07,.755,2.2,5],[.125,.635,1.9,3],[.20,.87,2.0,9],[.96,.71,2.1,3],[.90,.94,2.0,5],[-.02,.96,2.2,9],[.035,.56,2.0,5],[.27,.04,2.0,3],[.81,.095,1.9,5],[.735,.04,1.9,9],[.42,.17,2.0,9],[.63,.27,1.9,3]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(y<-.3||seaDist(x,z)>-1.5)continue;
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03){const route=ROUTES.find(r=>r.id===st.route),r=route.rows.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b),sign=(x-r.x)*r.nx+(z-r.z)*r.nz<0?-1:1;x=r.x+sign*r.nx*(r.w/2+M(1.15));z=r.z+sign*r.nz*(r.w/2+M(1.15));}
  if(Math.hypot(x-TOWER.x,z-TOWER.z)<TOWER.r*3)continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.38});
 }
 for(let i=0;i<520;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(y<-.3||seaDist(x,z)>-1||trailEdge(x,z)<M(.65)||field(x,z).rock>.35||Math.hypot(x-TOWER.x,z-TOWER.z)<TOWER.r*2.2)continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.62,1.25),{sy:R(.52,.82),tint:R(-.08,.14)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(y<-.3||seaDist(x,z)>-1||trailEdge(x,z)<.35||f.rock>.10||Math.hypot(x-TOWER.x,z-TOWER.z)<TOWER.r*1.6)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.2)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.6?'#f7da54':'#fff6dc'});
 }
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...ruinPalette);
function clearTowerFront(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if(Math.hypot(item.x-TOWER.x,item.z-TOWER.z)<TOWER.r*1.4||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.505,.80);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();scene.add(towerModel());
 seaStacks();scene.add(buildSea());fences();towerProps();scatteredRocks();plantForest();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 clearTowerFront();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
