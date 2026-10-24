// Rose Garden Glade: a native timber gazebo and planted stone terraces.
function embeddedRoadStones(){
 const pos=[],colors=[],palette=['#c9b58e','#d5bd96','#bfa982','#dbc49e'].map(c=>new THREE.Color(c));
 const stone=(x,z)=>{
  const y=height(x,z)+.025,r=R(.09,.24),angle=R(0,6.28),n=5,points=[];
  for(let k=0;k<n;k++){const a=angle+k/n*6.283,rr=r*R(.80,1.15),xx=x+Math.cos(a)*rr,zz=z+Math.sin(a)*rr*.76;points.push(new V3(xx,height(xx,zz)+.028,zz));}
  const tone=palette[Math.floor(rand()*palette.length)];
  for(let k=0;k<n;k++)for(const v of[new V3(x,y,z),points[(k+1)%n],points[k]]){pos.push(v.x,v.y,v.z);colors.push(tone.r,tone.g,tone.b);}
 };
 for(const route of ROUTES)for(let i=1;i<route.n-1;i++){
  const row=route.rows[i],count=['south','left','right'].includes(route.id)?7:3;
  for(let j=0;j<count;j++){if(rand()<.18)continue;const side=R(-.46,.46)*row.w,along=R(-.32,.32);stone(row.x+row.nx*side+row.ux*along,row.z+row.nz*side+row.uz*along);}
 }
 for(let i=0;i<650;i++){const[x,z]=P(R(.31,.79),R(.52,.70));if((polyAt(GARDEN_COURT,x,z)??1)<-.4&&(polyAt(GARDEN_ISLAND,x,z)??-1)>.5)stone(x,z);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 const mat=paint({vertexColors:true,side:THREE.DoubleSide,shade:[.60,.51,.41],mid:[.87,.76,.60]}),mesh=new THREE.Mesh(g,mat);mesh.name='embedded-road-stones';mesh.receiveShadow=true;scene.add(mesh);
}
function roseBed(u,v,radius=.028,clusters=3){
 for(let i=0;i<clusters;i++){
  const a=i*2.4,rr=radius*Math.sqrt(rand()),[x,y,z]=onGround(u+Math.cos(a)*rr,v+Math.sin(a)*rr*.60),st=stairsAt(x,z);
  if(st.s<st.half+M(.25)||(polyAt(PLAZA,x,z)??1)<0)continue;
  const s=R(.85,1.35);addBush(x,y-.08,z,s,{sy:.65,tint:R(-.02,.08)});
  for(let j=0;j<9;j++){
   const aa=j*2.4,rad=R(.30,.85)*s,p=new V3(x+Math.cos(aa)*rad,y+R(.75,1.50)*s,z+Math.sin(aa)*rad*.75),normal=new V3(R(-.6,.6),R(.6,1),R(.2,.8)).normalize();
   addRose(p,R(.23,.35),pick(['#eab9a9','#f0d5bd','#d99494','#f1dfca']),normal);
   woodBeam(new V3(x,y+.10,z),p.clone().addScaledVector(normal,-.12),.024,'#637d44');
   for(let k=0;k<2;k++)vineLeafItems.push({p:p.clone().lerp(new V3(x,y,z),.35+k*.2),normal:new V3(Math.cos(aa+k),.6,Math.sin(aa+k)).normalize(),s:R(.30,.44)});
  }
 }
}
function gardenRocks(){
 // Large broken outcrops frame the route; the small middle group is an island
 // in the path loop, not another high terrace or a formal circular border.
 for(const[u,v,w,h]of[[.492,.585,.034,.047],[.530,.605,.024,.035],[.466,.608,.022,.035]]){
  const[x,y,z]=onGround(u,v),ww=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  addStone(x,y-.08,z,ww,hh,ww*.72,{chamfer:.16,extra:15,moss:.18,base:pick(ruinPalette)});COLLIDERS.push({x,z,r:ww*.38});
 }
 const specs=[[.17,.44,.035,.05],[.12,.49,.04,.055],[.23,.49,.025,.035],[.205,.37,.035,.05],[.335,.32,.028,.045],[.39,.20,.035,.05],[.46,.18,.035,.05],[.58,.405,.035,.055],[.66,.405,.04,.06],[.735,.38,.03,.045],[.88,.29,.04,.06],[.795,.19,.03,.05],[.085,.77,.05,.07],[.18,.82,.05,.07],[.27,.86,.03,.04],[.85,.73,.042,.065],[.79,.86,.04,.06],[.925,.64,.035,.06],[.47,.60,.040,.05],[.52,.625,.027,.032],[.56,.61,.027,.035]];
 for(const[u,v,w,h]of specs){
  const[x,y,z]=onGround(u,v),ww=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h),st=stairsAt(x,z);
  if(st.s<st.half+ww*.45+.4||Math.hypot((x-GAZEBO.x)/GAZEBO.r,(z-GAZEBO.z)/GAZEBO.rz)<1.08)continue;
  addStone(x,y-.10,z,ww,hh,ww*.70,{chamfer:.16,extra:14,moss:.22,base:pick(ruinPalette)});COLLIDERS.push({x,z,r:ww*.39});
  if(rand()<.65)addBush(x+ww*.35,y-.05,z+ww*.25,ww*.28,{sy:.60,tint:.06});
 }
 for(let i=0;i<140;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.30,1.08)),st=stairsAt(x,z);if(st.s<st.half+.6||(polyAt(PLAZA,x,z)??1)<0||field(x,z).rock>.25)continue;
  const s=R(.15,.34);addStone(x,y-.04,z,s*1.6,s,s*1.2,{chamfer:.23,extra:5,noLine:true,moss:.10});
 }
}
function grove(){
 const specs=[[.10,.375,2.65,5],[.005,.58,2.35,3],[.07,.715,2.30,9],[.035,.93,2.65,5],[.18,.965,2.20,3],[.065,.12,2.50,9],[.19,.075,2.35,3],[.34,.11,2.50,5],[.47,.14,2.55,9],[.59,.35,2.55,5],[.68,.25,2.60,9],[.78,.12,2.35,3],[.93,.31,2.65,5],[1.02,.50,2.45,9],[.94,.69,2.50,3],[1.02,.925,2.80,5],[.84,.98,2.25,9],[.55,.03,2.45,3],[.99,.11,2.6,9],[.37,-.035,2.5,5],[.70,-.03,2.55,3]];
 for(const[u,v,s,seed]of specs){
  let[x,y,z]=onGround(u,v);const st=stairsAt(x,z);
  if(st.s<st.half+s*.45+.55){const route=ROUTES.find(r=>r.id===st.route),row=route.rows.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b),sign=(x-row.x)*row.nx+(z-row.z)*row.nz<0?-1:1;x=row.x+sign*row.nx*(row.w/2+s*.45+.75);z=row.z+sign*row.nz*(row.w/2+s*.45+.75);y=height(x,z);}
  if(Math.hypot((x-GAZEBO.x)/GAZEBO.r,(z-GAZEBO.z)/GAZEBO.rz)<1.45)continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.42});
 }
 for(let i=0;i<430;i++){
  const[x,y,z]=onGround(R(-.10,1.1),R(-.03,1.10)),st=stairsAt(x,z);
  if(trailEdge(x,z)<1.0||field(x,z).rock>.25||(polyAt(PLAZA,x,z)??1)<.5)continue;
  if(Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4>1.1)continue;
  addBush(x,y-.10,z,R(.75,1.40),{sy:R(.50,.78),tint:R(-.04,.08)});
 }
 for(const[u,v,r,n]of[[.18,.32,.045,5],[.195,.31,.022,4],[.33,.285,.025,5],[.32,.29,.030,3],[.33,.37,.035,3],[.13,.405,.033,3],[.20,.455,.040,4],[.49,.39,.035,4],[.61,.335,.040,5],[.735,.35,.032,4],[.87,.37,.035,4],[.93,.51,.037,4],[.16,.80,.045,5],[.295,.83,.034,4],[.83,.77,.045,5],[.80,.91,.04,4],[.49,.60,.045,5]])roseBed(u,v,r,n);
 for(let i=0;i<6500;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.7,GZ1)],y=height(x,z),f=field(x,z);
  if(trailEdge(x,z)<.50||f.rock>.12||(polyAt(PLAZA,x,z)??1)<.5)continue;
  if(Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3>.7)continue;
  grassItems.push({x,y:y-.025,z,s:R(.65,1.05),ry:R(0,6.28),k:R(.90,1.08)});
  if(rand()<.22)flowerItems.push({x,y:y+.02,z,s:R(.82,1.28),ry:R(0,6.28),c:rand()<.80?'#fff2d4':'#ebcf58'});
 }
}
function clearGardenPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),r=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<.20||(st.s<st.half+r+.25&&Math.abs(item.y-st.y)<M(.7)))list.splice(i,1);
 }
}
FOL.leaf=['#2b7152','#57973d','#b5c94d'];FOL.shrub=['#2e6a4a','#5c943e','#a9bd49'];STONE.splice(0,STONE.length,...ruinPalette);
function build(){
 const[x,z]=P(.50,.84);HERO.x=x;HERO.z=z;HERO.face=-2.7;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();embeddedRoadStones();gazeboModel();gardenRocks();grove();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.name='rose-stone-details';stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 clearGardenPaths();placeCoastPlants();placeRoses();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(){}
