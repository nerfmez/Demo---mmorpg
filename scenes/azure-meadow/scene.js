// Azure Meadow: orchard well, vegetable beds and connected village approaches.
const cropParts=[],blossomItems=[],FARM_AREAS=[];
function inFarm(x,z){return FARM_AREAS.some(p=>{let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[2]>z)!=(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;}return inside;});}
function farms(){
 const plots=[{pts:[[.005,.47],[.105,.43],[.23,.48],[.20,.56],[.015,.58]],rows:4,cols:6},{pts:[[.94,.40],[1.07,.39],[1.08,.53],[.95,.50]],rows:3,cols:4}];
 for(const plot of plots){
  const points=plot.pts.map(([u,v])=>onGround(u,v)),center=new V3();points.forEach(p=>center.add(new V3(...p)));center.divideScalar(points.length);
  FARM_AREAS.push(points);
  const positions=[],corners=[plot.pts[0],plot.pts[1],plot.pts[2],plot.pts.at(-1)],uvPoint=(a,b)=>{const A=corners[0],B=corners[1],C=corners[2],D=corners[3];return[(A[0]*(1-a)+B[0]*a)*(1-b)+(D[0]*(1-a)+C[0]*a)*b,(A[1]*(1-a)+B[1]*a)*(1-b)+(D[1]*(1-a)+C[1]*a)*b];};
  for(let i=0;i<16;i++)for(let j=0;j<12;j++)for(const[a,b]of[[i/16,j/12],[(i+1)/16,j/12],[(i+1)/16,(j+1)/12],[i/16,j/12],[(i+1)/16,(j+1)/12],[i/16,(j+1)/12]]){const[u,v]=uvPoint(a,b),[x,y,z]=onGround(u,v);positions.push(x,y+.09,z);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,paint({color:'#a47b45',side:THREE.DoubleSide,shade:[.57,.48,.37],mid:[.83,.69,.50]}));mesh.receiveShadow=true;mesh.name='vegetable-soil';scene.add(mesh);
  const uv=plot.pts;
  for(let row=0;row<plot.rows;row++)for(let col=0;col<plot.cols;col++){
   const a=(col+.65)/(plot.cols+.3),b=(row+.55)/(plot.rows+.2),u=(uv[0][0]*(1-a)+uv[1][0]*a)*(1-b)+(uv.at(-1)[0]*(1-a)+uv[2][0]*a)*b,v=(uv[0][1]*(1-a)+uv[1][1]*a)*(1-b)+(uv.at(-1)[1]*(1-a)+uv[2][1]*a)*b;
   const[x,y,z]=onGround(u,v),s=R(.65,.87);
   const core=new THREE.SphereGeometry(s*.35,7,5);core.scale(1,.85,1);core.translate(x,y+s*.35,z);cropParts.push(coloredPart(core,'#a5b85a'));
   for(let k=0;k<7;k++){const angle=k/7*Math.PI*2,leaf=new THREE.SphereGeometry(s*.42,6,4);leaf.scale(.64,.19,1.30);leaf.rotateX(.35);leaf.rotateY(angle);leaf.translate(x+Math.sin(angle)*s*.36,y+s*.17,z+Math.cos(angle)*s*.36);cropParts.push(coloredPart(leaf,k%2?'#5a974c':'#85b65a'));}
  }
  fenceRun([points.at(-1),points.at(-2),points[2]].map(p=>[p[0],p[2]]));
 }
 const[x,y,z]=onGround(.12,.586);barrel(x,z,.68,1.35);const g=new THREE.SphereGeometry(.47,9,6);g.scale(.8,1.35,.8);g.translate(x+1.10,y+.60,z);detailMesh(g,'#bda36d');
}
function orchard(){
 const trees=[[.06,.12,2.0,3],[.04,.37,1.95,5],[.08,.70,1.9,9],[.015,.92,1.8,3],[.21,.08,1.85,9],[.35,.18,1.65,5],[.45,.25,1.65,9],[.52,.13,1.8,3],[.40,.085,1.8,5],[.58,.07,1.85,9],[.68,.34,2.0,5],[.73,.16,1.65,9],[.60,.18,2.0,3],[.78,.20,1.95,5],[.83,.08,1.7,3],[.96,.27,1.9,5],[.96,.77,2.05,9],[1.04,.92,2.2,3],[-.03,.60,2.0,5]];
 for(const[u,v,s,seed]of trees){
  const[x,y,z]=onGround(u,v),st=stairsAt(x,z);if(st.s<st.half+M(.9)||Math.hypot(x-WELL.x,z-WELL.z)<WELL.r+M(.55))continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.42});
  if(u>.25&&u<.76)for(const[cx,cy,cz,rx,ry,rz]of ANIME.treeSprays)for(let i=0;i<6;i++){
   const px=(cx+R(-.6,.6)*rx)*3*s,py=(cy+R(-.3,.6)*ry)*2*s,pz=(cz+R(-.6,.6)*rz)*2.7*s,t=treeItems.at(-1),co=Math.cos(t.ry),si=Math.sin(t.ry);
   blossomItems.push({x:x+px*co+pz*si,y:y+3.5*s+py,z:z-px*si+pz*co,fruit:i===0,s:R(.14,.23)});
  }
 }
 for(let i=0;i<320;i++){
  const[x,y,z]=onGround(R(-.12,1.12),R(-.05,1.05)),f=field(x,z);if(inFarm(x,z)||trailEdge(x,z)<M(.58)||f.rock>.22||Math.hypot(x-WELL.x,z-WELL.z)<WELL.r+1.6)continue;
  const slope=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(slope>1.2)continue;
  addBush(x,y-.1,z,R(.65,1.20),{sy:R(.5,.8),tint:R(-.06,.08)});
 }
 for(let i=0;i<12500;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.70,GZ1)],y=height(x,z),f=field(x,z),st=stairsAt(x,z);
  if(inFarm(x,z)||trailEdge(x,z)<.50||f.rock>.10||Math.hypot(x-WELL.x,z-WELL.z)<WELL.r+.5)continue;
  if(Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3>.70)continue;
  grassItems.push({x,y:y-.03,z,s:R(.65,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.22)flowerItems.push({x,y:y+.02,z,s:R(.7,1.10),ry:R(0,6.28),c:rand()<.78?'#fff6d9':'#edd455'});
 }
}
function orchardBlossoms(){
 for(const fruit of[false,true]){
  const items=blossomItems.filter(p=>p.fruit===fruit);if(!items.length)continue;
  let geo;if(fruit)geo=new THREE.SphereGeometry(1,7,5);else{
   const parts=[];for(let i=0;i<5;i++){const a=i/5*Math.PI*2,g=new THREE.CircleGeometry(.54,5);g.translate(Math.cos(a)*.47,Math.sin(a)*.47,0);parts.push(g);}geo=mergeGeometries(parts);
  }
  const mesh=new THREE.InstancedMesh(geo,paint({color:fruit?'#d7a446':'#fff0ce',side:THREE.DoubleSide,shade:[.68,.72,.61],mid:[.94,.94,.79]}),items.length),mat=new THREE.Matrix4(),quat=new THREE.Quaternion();
  items.forEach((p,i)=>{quat.copy(camera.quaternion);mat.compose(new V3(p.x,p.y,p.z),quat,new V3(p.s,p.s,p.s));mesh.setMatrixAt(i,mat);});mesh.name=fruit?'orchard-fruit':'orchard-blossoms';scene.add(mesh);
 }
}
function meadowDetails(){
 for(const[u,v,w,h]of[[.22,.64,.035,.05],[.25,.76,.055,.08],[.32,.67,.032,.05],[.05,.83,.04,.06],[.15,.88,.04,.05],[.82,.79,.035,.06],[.91,.83,.045,.07],[.42,.36,.024,.03],[.72,.45,.025,.04],[.80,.28,.026,.04],[.37,.25,.028,.04]]){
  const[x,y,z]=onGround(u,v),ww=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h),st=stairsAt(x,z);if(st.s<st.half+ww*.5+.4)continue;
  addStone(x,y-.12,z,ww,hh,ww*.7,{extra:13,chamfer:.18,moss:.18,noLine:true,base:pick(ruinPalette)});COLLIDERS.push({x,z,r:ww*.39});
 }
 for(const points of[[[.01,.39],[.13,.385],[.23,.41]],[[.30,.14],[.37,.13],[.42,.12]],[[.69,.21],[.76,.22],[.79,.24]],[[.90,.415],[.93,.37],[.97,.345]]])fenceRun(points.map(([u,v])=>{const[x,y,z]=onGround(u,v);return[x,z];}));
 for(let i=0;i<120;i++){
  const[x,y,z]=onGround(R(.04,.98),R(.30,1.04)),st=stairsAt(x,z);if(st.s<st.half+.3||field(x,z).rock>.25)continue;
  const s=R(.12,.32);addStone(x,y-.04,z,s*1.6,s,s*1.1,{chamfer:.24,extra:5,noLine:true,moss:.06});
 }
}
function clearLandmarkPlants(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.6;
  const p=new V3(item.x,item.y+.3,item.z).project(camera),u=(p.x+1)/2,v=(1-p.y)/2;
  if((st.s<st.half+radius+.3&&Math.abs(item.y-st.y)<M(.7))||(u>.49&&u<.625&&v>.24&&v<.435))list.splice(i,1);
 }
}
FOL.leaf=['#2b7152','#57973d','#b5c94d'];FOL.shrub=['#2e6a4a','#5c943e','#a9bd49'];STONE.splice(0,STONE.length,...ruinPalette);
function wellApproachFloor(){
 // Give the narrow earthen access its own continuous surface; the common
 // heightfield still owns walking height and the surrounding banks.
 const route=ROUTES.find(r=>r.id==='well'),pos=[];
 const point=(r,f)=>{const x=r.x+r.nx*r.w*.49*f,z=r.z+r.nz*r.w*.49*f;return[x,height(x,z)+.045,z];};
 for(let i=0;i<route.n-1;i++)for(let k=0;k<10;k++){
  const A=point(route.rows[i],-1+k/5),B=point(route.rows[i],-1+(k+1)/5),C=point(route.rows[i+1],-1+(k+1)/5),D=point(route.rows[i+1],-1+k/5);
  for(const p of[A,C,B,A,D,C])pos.push(...p);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
 const mat=paint({color:'#e4c28a',shade:[.50,.42,.40],mid:[.80,.70,.62],band:[-.2,.18],albedo:`
   vec2 q=vW.xz;float n=fbm(q*.32);diffuseColor.rgb=mix(${L('#d4ac70')},${L('#e4c28a')},smoothstep(.3,.7,n));
   diffuseColor.rgb=mix(diffuseColor.rgb,${L('#b99765')},smoothstep(.60,.80,fbm(q*.8+5.))*.4);
 `});
 const mesh=new THREE.Mesh(g,mat);mesh.name='well-approach-ground';mesh.receiveShadow=true;scene.add(mesh);
}
function build(){
 const[x,z]=P(.50,.81);HERO.x=x;HERO.z=z;HERO.face=-2.7;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();wellApproachFloor();wellModel();gardenWalls();gateAndVillage();farms();meadowDetails();orchard();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.name='meadow-stone-details';stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);
 if(cropParts.length){const crops=new THREE.Mesh(mergeGeometries(cropParts),paint({vertexColors:true,shade:[.52,.66,.55],mid:[.80,.89,.70]}));crops.castShadow=crops.receiveShadow=true;scene.add(crops);}
 clearLandmarkPlants();placeCoastPlants();orchardBlossoms();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(){}
