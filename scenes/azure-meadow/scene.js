// Azure Meadow: orchard well, vegetable beds and connected village approaches.
const cropParts=[],cabbageItems=[],blossomItems=[],FARM_AREAS=[];
function inFarm(x,z){return nearFarm(x,z,0);}
// Within m of a bed (inside counts as 0). Used to keep plants that would hide a bed away from it.
function nearFarm(x,z,m){return FARM_AREAS.some(p=>{let inside=false,d=Infinity;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[2]>z)!=(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;const ex=b[0]-a[0],ez=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*ex+(z-a[2])*ez)/(ex*ex+ez*ez||1)));d=Math.min(d,Math.hypot(x-a[0]-ex*t,z-a[2]-ez*t));}return inside||d<m;});}
function farms(){
 // Two kitchen beds as in the concept, on level ground clear of the paths and
 // terrace edges: a raised bed of dark tilled soil whose rim slopes down into
 // the grass, ridges along its length with a row of cabbages on each, tomato
 // canes on the left bed, and a rail fence along its front and outer end.
 const keep=seed;seed=4243;
 const beds=[{c:[.105,.52],w:M(4.9),d:M(2.9),yaw:.3,rows:4,cols:7,tomatoes:true,props:true},{c:[1.042,.493],w:M(2.2),d:M(1.75),yaw:-.25,rows:3,cols:4}];
 const furrow=new THREE.Color('#5a3a22'),crest=new THREE.Color('#946538'),tone=new THREE.Color();
 for(const bed of beds){
  const[cx,,cz]=onGround(...bed.c),ca=Math.cos(bed.yaw),sa=Math.sin(bed.yaw);
  // local (a along the bed, b across it, +b towards the camera) to world
  const at=(a,b)=>[cx+a*ca+b*sa,cz-a*sa+b*ca];
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>{const[x,z]=at(i*bed.w/2,j*bed.d/2);return[x,height(x,z),z];});
  FARM_AREAS.push(corners);
  let top=-Infinity;for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){const[x,z]=at((i/8-.5)*bed.w,(j/8-.5)*bed.d);top=Math.max(top,height(x,z));}
  top+=.12;
  // One grid covers the bed and a rim beyond it; the rim drops below the grass.
  const RIM=M(.16),NR=bed.rows,RH=M(.1),GU=28,GV=NR*6+4,pos=[],col=[],idx=[];
  for(let j=0;j<=GV;j++)for(let i=0;i<=GU;i++){
   const a=(i/GU-.5)*(bed.w+2*RIM),b=(j/GV-.5)*(bed.d+2*RIM),[x,z]=at(a,b);
   const out=Math.max(Math.abs(a)-bed.w/2,Math.abs(b)-bed.d/2,0)/RIM,bb=(b+bed.d/2)/bed.d;
   const k=out>0?0:(.5+.5*Math.cos(2*Math.PI*(bb*NR-.5)))*smooth(0,.08,Math.min(1-Math.abs(a)/(bed.w/2),1));
   const y=top+RH*k,ground=height(x,z)-.1,rim=smooth(0,1,out);
   pos.push(x,y+(ground-y)*rim,z);
   tone.copy(furrow).lerp(crest,k).multiplyScalar(1-.18*rim);col.push(tone.r,tone.g,tone.b);
  }
  for(let j=0;j<GV;j++)for(let i=0;i<GU;i++){const q=j*(GU+1)+i;idx.push(q,q+GU+1,q+1,q+1,q+GU+1,q+GU+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,paint({vertexColors:true,side:THREE.DoubleSide,shade:[.57,.48,.37],mid:[.83,.69,.50]}));mesh.receiveShadow=true;mesh.name='vegetable-soil';scene.add(mesh);
  for(let r=0;r<NR;r++)for(let k=0;k<bed.cols;k++){
   const a=((k+.5)/bed.cols-.5)*bed.w*.9+R(-.12,.12),b=((r+.5)/NR-.5)*bed.d,[x,z]=at(a,b);
   cabbageItems.push({x,y:top+RH-.1,z,s:R(1.35,1.6),ry:R(0,6.28)});
  }
  if(bed.tomatoes)for(let k=0;k<5;k++){
   // tomato canes on stakes along the bed's back edge
   const[x,z]=at(((k+.5)/5-.5)*bed.w*.9,-bed.d/2+M(.1));
   woodBeam(new V3(x,top-.1,z),new V3(x+R(-.05,.05),top+M(.55),z),M(.028),'#8a6d43');
   addBush(x,top+M(.06),z,M(R(.15,.19)),{sy:1.1,tint:-.06});
   for(let f=0;f<5;f++){const t=new THREE.SphereGeometry(M(.035),6,4);t.translate(x+R(-.45,.45),top+M(R(.15,.42)),z+R(-.3,.3));cropParts.push(coloredPart(t,f%2?'#d8432b':'#e8692f'));}
  }
  // the rail fence: along the front and round the outer end (towards the road), just off the bed
  const F=M(.35),side=bed.yaw>0?1:-1,fence=[[-side*(bed.w/2+F),bed.d/2+F],[side*(bed.w/2+F),bed.d/2+F],[side*(bed.w/2+F),-bed.d/2]].map(([a,b])=>at(a,b));
  fenceRun(fence);
  if(bed.props){const[x,z]=at(-side*(bed.w/2-M(.3)),bed.d/2+M(.75));barrel(x,z,.68,1.35);const y=height(x,z),g=new THREE.SphereGeometry(.47,9,6);g.scale(.8,1.35,.8);g.translate(x+1.10,y+.60,z);detailMesh(g,'#bda36d');}
 }
 seed=keep;
}
// One cabbage (a pale head in a ring of darker outer leaves), drawn once per bed spot.
function cabbages(){
 if(!cabbageItems.length)return;
 const parts=[],head=new THREE.SphereGeometry(.34,8,6);head.scale(1,.82,1);head.translate(0,.30,0);parts.push(coloredPart(head,'#bdd37b'));
 for(let k=0;k<7;k++){const a=k/7*Math.PI*2,leaf=new THREE.SphereGeometry(.42,6,4);leaf.scale(.66,.2,1.3);leaf.rotateX(.38);leaf.rotateY(a);leaf.translate(Math.sin(a)*.34,.16,Math.cos(a)*.34);parts.push(coloredPart(leaf,k%2?'#5b984a':'#82b759'));}
 const mesh=new THREE.InstancedMesh(mergeGeometries(parts),paint({vertexColors:true,shade:[.52,.66,.55],mid:[.80,.89,.70]}),cabbageItems.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new V3(0,1,0);
 cabbageItems.forEach((p,i)=>{q.setFromAxisAngle(up,p.ry);m.compose(new V3(p.x,p.y,p.z),q,new V3(p.s,p.s,p.s));mesh.setMatrixAt(i,m);});
 mesh.name='cabbages';mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
}
function orchard(){
 const trees=[[.045,.12,2.45,3],[.045,.35,2.50,5],[-.07,.84,2.30,9],[.015,.91,2.25,3],[.24,.055,2.20,9],[.355,.225,2.40,5],[.47,.24,2.35,9],[.44,.08,2.40,3],[.57,.12,2.50,5],[.67,.355,2.30,5],[.735,.18,2.20,9],[.69,.06,2.25,3],[.79,.13,2.20,5],[.94,.20,2.35,9],[1.015,.36,2.45,5],[.955,.73,2.70,9],[1.04,.92,2.65,3],[-.10,.47,2.35,5],[.15,.94,2.15,9],[.86,.055,2.25,3],[.52,-.025,2.55,5],[.33,-.025,2.45,9]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v);const st=stairsAt(x,z);
  if(st.s<st.half+s*.45+.6){const route=ROUTES.find(r=>r.id===st.route),row=route.rows.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b),sign=(x-row.x)*row.nx+(z-row.z)*row.nz<0?-1:1;x=row.x+sign*row.nx*(row.w/2+s*.45+.8);z=row.z+sign*row.nz*(row.w/2+s*.45+.8);y=height(x,z);}
  if(Math.hypot((x-WELL.x)/WELL.r,(z-WELL.z)/WELL.rz)<1.25)continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.42});
  for(const[cx,cy,cz,rx,ry,rz]of ANIME.treeSprays)for(let i=0;i<12;i++){
   const px=(cx+R(-.6,.6)*rx)*3*s,py=(cy+R(-.3,.6)*ry)*2*s,pz=(cz+R(-.6,.6)*rz)*2.7*s,t=treeItems.at(-1),co=Math.cos(t.ry),si=Math.sin(t.ry);
   blossomItems.push({x:x+px*co+pz*si,y:y+3.5*s+py,z:z-px*si+pz*co,fruit:i===0,s:R(.23,.35)});
  }
 }
 for(let i=0;i<460;i++){
  const[x,y,z]=onGround(R(-.12,1.12),R(-.05,1.05)),f=field(x,z);if(nearFarm(x,z,M(1))||trailEdge(x,z)<M(.58)||f.rock>.22||Math.hypot(x-WELL.x,z-WELL.z)<WELL.r+1.6)continue;
  const slope=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(slope>1.2)continue;
  addBush(x,y-.1,z,R(.75,1.45),{sy:R(.5,.78),tint:R(-.06,.08)});
 }
 for(const[u,v,rr]of[[.23,.65,.07],[.30,.68,.045],[.38,.46,.035],[.48,.47,.025],[.61,.48,.035],[.70,.42,.035],[.12,.40,.045],[.26,.28,.03],[.79,.31,.028],[.86,.62,.035]]){
  for(let i=0;i<12;i++){const a=R(0,6.28),r=Math.sqrt(rand())*rr,[x,y,z]=onGround(u+Math.cos(a)*r,v+Math.sin(a)*r*.65),st=stairsAt(x,z);if(inFarm(x,z)||st.s<st.half+1.0)continue;
   if(i<3)addBush(x,y-.08,z,R(.72,1.16),{sy:.60,tint:.04});
   for(let k=0;k<7;k++)flowerItems.push({x:x+R(-.5,.5),y:y+.03,z:z+R(-.45,.45),s:R(.95,1.40),ry:R(0,6.28),c:rand()<.78?'#fff3d1':'#edce52'});
  }
 }

 for(let i=0;i<6900;i++){
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
  // never taller than wide: field boulders lie low, they do not stand as pillars
  const[x,y,z]=onGround(u,v),ww=wide(u-w/2,u+w/2,v,y),hh=Math.min(tall(x,z,y,v-h),ww*.62),st=stairsAt(x,z);if(st.s<st.half+ww*.5+.4)continue;
  // a rounded, mossy boulder with a smaller stone at its foot, bedded in plants
  fieldStone(x,y-.18,z,ww,hh,ww*.78,{moss:.4,ry:R(-.4,.4),rz:R(-.07,.07)});COLLIDERS.push({x,z,r:ww*.39});
  const a=R(0,6.28),xx=x+Math.cos(a)*ww*.55,zz=z+Math.sin(a)*ww*.4,ss=ww*R(.3,.45);
  fieldStone(xx,height(xx,zz)-.1,zz,ss,ss*R(.5,.7),ss*.8,{moss:.3,ry:R(0,3)});
  for(let k=0;k<2;k++){const b=R(0,6.28);addBush(x+Math.cos(b)*ww*.6,y-.05,z+Math.sin(b)*ww*.45,ww*R(.22,.3),{sy:.62,tint:R(0,.06)});}
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
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.name='meadow-stone-details';stones.userData.authoredNormals=true;stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 cabbages();
 if(cropParts.length){const crops=new THREE.Mesh(mergeGeometries(cropParts),paint({vertexColors:true,shade:[.52,.66,.55],mid:[.80,.89,.70]}));crops.castShadow=crops.receiveShadow=true;scene.add(crops);}
 clearLandmarkPlants();placeCoastPlants();orchardBlossoms();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(){}
