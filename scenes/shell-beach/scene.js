// Shell Beach: the retained Azure Coast concept, with a hollow, flared conch.
const seaRocks=[];
// The shells' painted material: weathered cream outside, a plain pink inside.
function shellMaterial(inside=false){
  return paint({vertexColors:true,side:THREE.DoubleSide,shade:inside?[.48,.37,.36]:[.62,.59,.56],mid:inside?[.85,.69,.62]:[.88,.83,.72],band:[-.18,.30],albedo:inside?'':`
    float weather=vnoise(vW.xz*1.3+vW.y*.7);
    float streak=vnoise(vec2(vW.x*.8+vW.z*.2,vW.y*.08));
    float stain=smoothstep(.63,.79,weather)*smoothstep(.51,.72,streak);
    diffuseColor.rgb=mix(diffuseColor.rgb,${L('#bd9964')},stain*.42);
    float lichen=smoothstep(.65,.80,vnoise(vW.xz*.72+vW.y*.15))*smoothstep(.52,.76,vnoise(vW.xz*2.1+vW.y*.12));
    diffuseColor.rgb=mix(diffuseColor.rgb,${L('#8e9951')},lichen*.5);
  `});
}
function shellMesh(pos,colors,inside=false){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,shellMaterial(inside));mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function scallop(r=.7,coral=true){
  const pos=[],colors=[],tone=new THREE.Color(coral?'#cf9273':'#d5d3bc'),pale=new THREE.Color('#f9e5bf');
  const p=(a,t)=>new V3(Math.cos(a)*r*t,(Math.sin(a)*.65+.07*Math.cos(a*12))*r*t,Math.sin(a)*r*t*.83);
  for(let i=0;i<24;i++)for(let j=0;j<5;j++){
    const a=i/24*Math.PI,b=(i+1)/24*Math.PI,t=j/5,t1=(j+1)/5,c=tone.clone().lerp(pale,i%2?.8:.1);
    for(const v of[p(a,t),p(b,t),p(b,t1),p(a,t),p(b,t1),p(a,t1)]){pos.push(v.x,v.y,v.z);colors.push(c.r,c.g,c.b);}
  }
  const mesh=shellMesh(pos,colors);mesh.rotation.x=-.40;return mesh;
}
function coastalBoulders(){
  // Natural rock: low, rounded outcrops at the waterline (the concept's sea
  // stacks), built from a few leaning boulders with moss on top, and loose
  // rubble round their feet. No upright pillars and no blocks on the open sand.
  const keep=seed;seed=31337;
  const round={chamfer:.42,extra:22,jitter:.12};
  const specs=[[.025,.79,.055],[.09,.79,.065],[.135,.84,.052],[.215,.82,.034],[.66,.82,.05],[.735,.89,.055],[.80,.92,.04],[.90,.91,.025],[.15,.68,.028],[.88,.76,.025]];
  for(const[u,v,hu]of specs){
    const[x,z0]=P(u,v),w=wide(u-hu/2,u+hu/2,v,0),g=height(x,z0),d=w*.8,z=z0-d*.22;
    // one broad mound and two or three smaller stones leaning on it
    const h=w*R(.55,.8);
    addStone(x,g-.35,z,w*1.05,h,d,{...round,moss:.15,ry:R(0,3)});
    for(let i=0,n=2+(rand()<.5?1:0);i<n;i++){
      const a=i/n*6.28+R(-.5,.5),xx=x+Math.cos(a)*w*R(.42,.6),zz=z+Math.sin(a)*d*R(.42,.6),ss=w*R(.35,.55);
      addStone(xx,height(xx,zz)-.25,zz,ss,ss*R(.55,.85),ss*.9,{...round,moss:.12,ry:R(0,3),rz:R(-.25,.25)});
    }
    for(let i=0;i<4;i++){const xx=x+R(-1,1)*w*.9,zz=z+R(-.7,.7)*d,ss=R(.10,.22)*w;addStone(xx,height(xx,zz)-.06,zz,ss,ss*R(.5,.8),ss*.9,{...round,noLine:true});}
    if(z>zShore(x)-1){if(seaRocks.length<8)seaRocks.push([x,z,w*.42]);}
    else COLLIDERS.push({x,z,r:w*.4});
  }
  for(let i=0;i<110;i++){
    const[u,v]=[R(.08,.94),R(.38,.83)],[x,z]=P(u,v),f=field(x,z);
    if(f.top>.15||z>zShore(x)-.8||(u>.44&&u<.81&&v<.51))continue;
    const r=R(.09,.30);addStone(x,height(x,z)-.04,z,r*1.5,r,r*1.2,{extra:6,chamfer:.36,noLine:true,moss:0});
  }
  while(seaRocks.length<8)seaRocks.push([9999,9999,.1]);
  seed=keep;
}
function treeFoot(u,v){
  let hi=M(8),lo=hi;
  for(;lo>0;lo-=.4){const q=P(u,v,lo);if(lo<=height(...q))break;hi=lo;}
  lo=Math.max(0,lo);
  for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
  let[x,z]=P(u,v,(hi+lo)/2);
  const st=stairsAt(x,z);
  if(st.a>-.03&&st.a<1.04&&st.s<st.half+M(.55)){
    const r=ST.rows.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b);
    const side=(x-r.x)*r.nx+(z-r.z)*r.nz<0?-1:1;
    x=r.x+r.nx*side*(r.w/2+M(.8));z=r.z+r.nz*side*(r.w/2+M(.8));
  }
  return[x,z];
}
function clearConchPlants(){
  // Clear only the projected opening, leaving foliage on the shell's back wall.
  const poly=[[.678,.177],[.676,.214],[.685,.255],[.736,.274],[.75,.35],[.76,.40],[.786,.503],[.71,.46],[.65,.40],[.64,.31],[.65,.25]];
  const inside=(u,v)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>v)!=(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){const p=new V3(list[i].x,list[i].y,list[i].z).project(camera);if(inside((p.x+1)/2,(1-p.y)/2))list.splice(i,1);}
}
function plantCoast(){
  // The same leaf cards and trunks as the approved game scenes.
  const palms=[[.04,.34,7.8,-.15,3],[.39,.39,7.6,.3,2.6],[.87,.48,6.3,2.6,1.4],[.94,.70,8.0,3.4,3.2],[.92,.23,7.3,3.1,2],[.52,.09,7.7,-.6,2.5]];
  for(const[u,v,h,dir,lean]of palms){const[x,z]=treeFoot(u,v);palm(x,z,{h,dir,lean,fronds:10,droop:.8});COLLIDERS.push({x,z,r:.7});}
  const trees=[[.01,.29,1.6,3],[.15,.22,1.65,5],[.29,.27,1.8,9],[.32,.14,1.65,3],[.45,.12,1.6,5],[.57,.08,1.7,9],[.68,.19,1.75,5],[.80,.18,1.6,3],[.94,.19,1.8,9],[.98,.41,1.65,3],[-.03,.57,1.55,5]];
  for(const[u,v,sc,seed]of trees){const[x,z]=treeFoot(u,v);broadleaf(x,z,sc,seed);COLLIDERS.push({x,z,r:sc*.38});}
  for(let i=0;i<520;i++){
    const[x,z]=P(R(-.12,1.12),R(-.15,.75)),f=field(x,z);
    if(f.top<.90||trailEdge(x,z)<1.0||stairsAt(x,z).inside)continue;
    addBush(x,height(x,z)-.12,z,R(.8,1.7),{sy:R(.55,.9),tint:.1});
  }
  for(let i=0;i<5800;i++){
    const x=R(GX0*.8,GX1*.8),z=R(GZ0*.75,GZ1),f=field(x,z);
    if(f.top<.9||trailEdge(x,z)<.5||f.rock>.08||stairsAt(x,z).inside)continue;
    grassItems.push({x,y:height(x,z)-.03,z,s:R(.65,1.05),ry:R(0,6.28),k:R(.86,1.1)});
    if(rand()<.14)flowerItems.push({x,y:height(x,z)+.01,z,s:R(.7,1),ry:R(0,6.28),c:rand()<.8?'#f7d745':'#fff7d6'});
  }
}
function placeCoastPlants(){
  const place=(mesh,items,scale)=>{
    const m=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color();
    items.forEach((it,i)=>{q.setFromEuler(new THREE.Euler(it.rx||0,it.ry||0,0,'YXZ'));m.compose(new V3(it.x,it.y,it.z),q,scale(it));mesh.setMatrixAt(i,m);mesh.setColorAt(i,it.c?c.set(it.c):c.setRGB(it.k,it.k,it.k*.97));});mesh.instanceMatrix.needsUpdate=true;return mesh;
  };
  if(woodParts.length){const wood=new THREE.Mesh(mergeGeometries(woodParts),paint({vertexColors:true,shade:[.55,.48,.46],mid:[.78,.69,.60]}));wood.castShadow=wood.receiveShadow=true;scene.add(wood);}
  if(coconutParts.length)scene.add(new THREE.Mesh(mergeGeometries(coconutParts),paint({vertexColors:true})));
  for(const young of[false,true]){
    const items=frondItems.filter(f=>f.young===young),geo=young?gamePalmFrond(2.3,1.4,.45,.95):gamePalmFrond(4.2,1.1,1.9,1.5);
    const mat=paint({map:palmFrondTexture(),alphaTest:.45,side:THREE.DoubleSide,shade:[.58,.68,.62],mid:[.58,.68,.62],band:[-5,-5],sway:[.05,0]});
    const mesh=place(new THREE.InstancedMesh(geo,mat,items.length),items,it=>new V3(it.s*1.35,it.s*1.35,it.s*1.35));mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:palmFrondTexture(),alphaTest:.45});mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  }
  const leafMat=shrub=>paint({vertexColors:true,map:branchletTexture(shrub),alphaTest:.45,side:THREE.DoubleSide,shade:[.60,.70,.72],mid:[.60,.70,.72],band:[-5,-5],sway:[shrub?.02:.016,shrub?0:1.2]});
  const leafDepth=shrub=>new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:branchletTexture(shrub),alphaTest:.45});
  const trunks=place(new THREE.InstancedMesh(animeTrunk(),paint({vertexColors:true,shade:[.62,.62,.70],mid:[.62,.62,.70],band:[-5,-5]}),treeItems.length),treeItems,it=>new V3(it.s,it.s,it.s));trunks.castShadow=trunks.receiveShadow=true;scene.add(trunks);
  for(const[seed,v]of [[3,0],[5,1],[9,2]]){
    // Fuller crowns, as in the concepts' canopy: wider than the game's default, on the same trunks and colliders.
    const items=treeItems.filter(t=>t.v===v).map(t=>({...t,y:t.y+3.6*t.s}));if(!items.length)continue;
    const mesh=place(new THREE.InstancedMesh(animeFoliage(seed,false),leafMat(false),items.length),items,it=>new V3(3.6*it.s,2.4*it.s,3.25*it.s));mesh.customDepthMaterial=leafDepth(false);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  }
  for(const[seed,v]of[[11,0],[13,1],[19,2]]){
    const items=shrubItems.filter(t=>t.v===v);if(!items.length)continue;
    const mesh=place(new THREE.InstancedMesh(animeFoliage(seed,true),leafMat(true),items.length),items,it=>new V3(it.sx,it.sy,it.sz));mesh.customDepthMaterial=leafDepth(true);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  }
  for(const[type,items,geo]of[['grass',grassItems,meadowGrass()],['flowers',flowerItems,wildflower()]]){
    const mesh=place(new THREE.InstancedMesh(geo,paint({vertexColors:true,side:THREE.DoubleSide,shade:[.6,.72,.68],mid:[.6,.72,.68],band:[-5,-5],sway:[.12,0]}),items.length),items,it=>new V3(it.s,it.s,it.s));mesh.receiveShadow=true;scene.add(mesh);
  }
}
FOL.leaf=['#2c6d55','#518f40','#a9bf48'];FOL.shrub=['#2e6750','#528c3c','#a4b942'];STONE.splice(0,STONE.length,...ruinPalette);
function build(){
  const[x,z]=P(.5,.752);HERO.x=x;HERO.z=z;HERO.face=-2.7;
  scene.add(buildGround());scene.add(buildCliffs());buildLedges();
  coastalBoulders();plantCoast();
  for(const[u,v,r,c]of[[.40,.465,.8,true],[.51,.445,.9,false],[.665,.49,1,true],[.70,.50,.9,true],[.35,.60,.8,true],[.60,.78,.85,true],[.88,.79,.6,false],[.25,.62,.6,false],[.47,.70,.55,true],[.56,.55,.5,false],[.76,.66,.6,true],[.31,.74,.5,false]]){
    const[x,z]=P(u,v),s=scallop(r*1.6,c);s.position.set(x,height(x,z)+.04,z);s.rotation.y=R(-.6,.6);scene.add(s);
  }
  const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
  clearConchPlants();placeCoastPlants();scene.add(giantConch());
  scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));scene.add(buildSea());setStatus();
}
function updateAmbience(){}
