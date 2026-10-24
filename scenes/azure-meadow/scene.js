// Azure Meadow: orchard well, vegetable beds and connected village approaches.
const cropParts=[],blossomItems=[],FARM_AREAS=[];
function inFarm(x,z){return FARM_AREAS.some(p=>{let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[2]>z)!=(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;}return inside;});}
function farms(){
 const plots=[{pts:[[.005,.47],[.105,.43],[.23,.48],[.20,.56],[.015,.58]],rows:3,cols:5},{pts:[[.94,.40],[1.07,.39],[1.08,.53],[.95,.50]],rows:3,cols:4}];
 for(const plot of plots){
  const points=plot.pts.map(([u,v])=>onGround(u,v)),center=new V3();points.forEach(p=>center.add(new V3(...p)));center.divideScalar(points.length);
  FARM_AREAS.push(points);
  const positions=[],corners=[plot.pts[0],plot.pts[1],plot.pts[2],plot.pts.at(-1)],uvPoint=(a,b)=>{const A=corners[0],B=corners[1],C=corners[2],D=corners[3];return[(A[0]*(1-a)+B[0]*a)*(1-b)+(D[0]*(1-a)+C[0]*a)*b,(A[1]*(1-a)+B[1]*a)*(1-b)+(D[1]*(1-a)+C[1]*a)*b];};
  const GU=48,GV=36;for(let i=0;i<GU;i++)for(let j=0;j<GV;j++)for(const[a,b]of[[i/GU,j/GV],[(i+1)/GU,j/GV],[(i+1)/GU,(j+1)/GV],[i/GU,j/GV],[(i+1)/GU,(j+1)/GV],[i/GU,(j+1)/GV]]){const[u,v]=uvPoint(a,b),[x,y,z]=onGround(u,v);positions.push(x,y+.09,z);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const row=new V3(points[1][0]-points[0][0],0,points[1][2]-points[0][2]).normalize();
  // Tilled ridges run along the bed; they are painted, so they cost no geometry.
  const mesh=new THREE.Mesh(g,paint({color:'#a47b45',side:THREE.DoubleSide,shade:[.57,.48,.37],mid:[.83,.69,.50],albedo:`
      float along=dot(vW.xz,vec2(${(-row.z).toFixed(4)},${row.x.toFixed(4)}));
      float ridge=abs(fract(along*.95)*2.-1.);
      diffuseColor.rgb*=.80+.26*smoothstep(.25,.75,ridge);
    `}));mesh.receiveShadow=true;mesh.name='vegetable-soil';scene.add(mesh);
  const uv=plot.pts;
  for(let row=0;row<plot.rows;row++)for(let col=0;col<plot.cols;col++){
   const a=(col+.65)/(plot.cols+.3),b=(row+.55)/(plot.rows+.2),u=(uv[0][0]*(1-a)+uv[1][0]*a)*(1-b)+(uv.at(-1)[0]*(1-a)+uv[2][0]*a)*b,v=(uv[0][1]*(1-a)+uv[1][1]*a)*(1-b)+(uv.at(-1)[1]*(1-a)+uv[2][1]*a)*b;
   const[x,y,z]=onGround(u,v),s=R(1.0,1.30);
   const core=new THREE.SphereGeometry(s*.35,7,5);core.scale(1,.85,1);core.translate(x,y+s*.35,z);cropParts.push(coloredPart(core,'#a5b85a'));
   for(let k=0;k<7;k++){const angle=k/7*Math.PI*2,leaf=new THREE.SphereGeometry(s*.42,6,4);leaf.scale(.64,.19,1.30);leaf.rotateX(.35);leaf.rotateY(angle);leaf.translate(x+Math.sin(angle)*s*.36,y+s*.17,z+Math.cos(angle)*s*.36);cropParts.push(coloredPart(leaf,k%2?'#5a974c':'#85b65a'));}
  }
  fenceRun([points.at(-1),points.at(-2),points[2]].map(p=>[p[0],p[2]]));
 }
 const[x,y,z]=onGround(.12,.586);barrel(x,z,.68,1.35);const g=new THREE.SphereGeometry(.47,9,6);g.scale(.8,1.35,.8);g.translate(x+1.10,y+.60,z);detailMesh(g,'#bda36d');
}
function orchard(){
 const trees=[[.045,.12,2.45,3],[.045,.35,2.50,5],[.055,.69,2.30,9],[.015,.91,2.25,3],[.24,.055,2.20,9],[.355,.225,2.40,5],[.47,.24,2.35,9],[.44,.08,2.40,3],[.57,.12,2.50,5],[.67,.355,2.30,5],[.735,.18,2.20,9],[.69,.06,2.25,3],[.79,.13,2.20,5],[.94,.20,2.35,9],[1.015,.36,2.45,5],[.955,.73,2.70,9],[1.04,.92,2.65,3],[-.035,.57,2.35,5],[.15,.94,2.15,9],[.86,.055,2.25,3],[.52,-.025,2.55,5],[.33,-.025,2.45,9]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v);const st=stairsAt(x,z);
  if(st.s<st.half+s*.45+.6){const route=ROUTES.find(r=>r.id===st.route),row=route.rows.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b),sign=(x-row.x)*row.nx+(z-row.z)*row.nz<0?-1:1;x=row.x+sign*row.nx*(row.w/2+s*.45+.8);z=row.z+sign*row.nz*(row.w/2+s*.45+.8);y=height(x,z);}
  if(Math.hypot((x-WELL.x)/WELL.r,(z-WELL.z)/WELL.rz)<1.25)continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.42});
  if(u>.25&&u<.76)for(const[cx,cy,cz,rx,ry,rz]of ANIME.treeSprays)for(let i=0;i<12;i++){
   const px=(cx+R(-.6,.6)*rx)*3*s,py=(cy+R(-.3,.6)*ry)*2*s,pz=(cz+R(-.6,.6)*rz)*2.7*s,t=treeItems.at(-1),co=Math.cos(t.ry),si=Math.sin(t.ry);
   blossomItems.push({x:x+px*co+pz*si,y:y+3.5*s+py,z:z-px*si+pz*co,fruit:i===0,s:R(.23,.35)});
  }
 }
 for(let i=0;i<460;i++){
  const[x,y,z]=onGround(R(-.12,1.12),R(-.05,1.05)),f=field(x,z);if(inFarm(x,z)||trailEdge(x,z)<M(.58)||f.rock>.22||Math.hypot(x-WELL.x,z-WELL.z)<WELL.r+1.6)continue;
  const slope=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(slope>1.2)continue;
  addBush(x,y-.1,z,R(.75,1.45),{sy:R(.5,.78),tint:R(-.06,.08)});
 }
 for(const[u,v,rr]of[[.23,.65,.07],[.30,.68,.045],[.38,.46,.035],[.48,.47,.025],[.61,.48,.035],[.70,.42,.035],[.12,.40,.045],[.26,.28,.03],[.79,.31,.028],[.86,.62,.035]]){
  for(let i=0;i<12;i++){const a=R(0,6.28),r=Math.sqrt(rand())*rr,[x,y,z]=onGround(u+Math.cos(a)*r,v+Math.sin(a)*r*.65),st=stairsAt(x,z);if(inFarm(x,z)||st.s<st.half+1.0)continue;
   if(i<3)addBush(x,y-.08,z,R(.72,1.16),{sy:.60,tint:.04});
   for(let k=0;k<7;k++)flowerItems.push({x:x+R(-.5,.5),y:y+.03,z:z+R(-.45,.45),s:R(.95,1.40),ry:R(0,6.28),c:rand()<.78?'#fff3d1':'#edce52'});
  }
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
 for(const[u,v,w,h]of[[.205,.64,.044,.05],[.25,.68,.038,.055],[.285,.72,.032,.040],[.05,.83,.04,.06],[.15,.88,.04,.05],[.82,.79,.035,.06],[.91,.83,.045,.07],[.42,.36,.024,.03],[.72,.45,.025,.04],[.80,.28,.026,.04],[.37,.25,.028,.04]]){
  const[x,y,z]=onGround(u,v),ww=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h),st=stairsAt(x,z);if(st.s<st.half+ww*.5+.4)continue;
  addStone(x,y-.12,z,ww,hh,ww*.7,{extra:13,chamfer:.18,moss:.18,base:pick(ruinPalette)});COLLIDERS.push({x,z,r:ww*.39});
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
function embeddedRoadStones(){
 // Worn stones sit in the same physical road floor. One small static mesh;
 // their irregular spacing keeps the village roads from reading as clean strips.
 const pos=[],colors=[],palette=['#c9b58e','#d5bd96','#bfa982','#dbc49e'].map(c=>new THREE.Color(c));
 for(const route of ROUTES)for(let i=1;i<route.n-1;i++){
  const row=route.rows[i],count=route.id==='south'?9:route.id==='left'||route.id==='village'?7:3;
  for(let j=0;j<count;j++){
   if(rand()<.18)continue;
   const side=R(-.46,.46)*row.w,along=R(-.32,.32),x=row.x+row.nx*side+row.ux*along,z=row.z+row.nz*side+row.uz*along,y=height(x,z)+.025;
   const r=R(.09,.24),angle=R(0,6.28),n=5,points=[];
   for(let k=0;k<n;k++){const a=angle+k/n*6.283,rr=r*R(.80,1.15),xx=x+Math.cos(a)*rr,zz=z+Math.sin(a)*rr*.76;points.push(new V3(xx,height(xx,zz)+.028,zz));}
   const tone=palette[Math.floor(rand()*palette.length)];
   for(let k=0;k<n;k++)for(const v of[new V3(x,y,z),points[(k+1)%n],points[k]]){pos.push(v.x,v.y,v.z);colors.push(tone.r,tone.g,tone.b);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 const mat=paint({vertexColors:true,side:THREE.DoubleSide,shade:[.60,.51,.41],mid:[.87,.76,.60]}),mesh=new THREE.Mesh(g,mat);mesh.name='embedded-road-stones';mesh.receiveShadow=true;scene.add(mesh);
}
function build(){
 const[x,z]=P(.50,.81);HERO.x=x;HERO.z=z;HERO.face=-2.7;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();embeddedRoadStones();wellModel();gardenWalls();gateAndVillage();farms();meadowDetails();orchard();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.name='meadow-stone-details';stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 if(cropParts.length){const crops=new THREE.Mesh(mergeGeometries(cropParts),paint({vertexColors:true,shade:[.52,.66,.55],mid:[.80,.89,.70]}));crops.castShadow=crops.receiveShadow=true;scene.add(crops);}
 clearLandmarkPlants();placeCoastPlants();orchardBlossoms();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(){}
