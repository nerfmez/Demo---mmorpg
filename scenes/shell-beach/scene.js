// Shell Beach: the retained Azure Coast concept, with a hollow, flared conch.
const seaRocks=[];
const shellParts=[];
function shellMesh(pos,colors,inside=false){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const m=paint({vertexColors:true,side:THREE.DoubleSide,shade:inside?[.48,.37,.36]:[.62,.59,.56],mid:inside?[.85,.69,.62]:[.88,.83,.72],band:[-.18,.30],albedo:inside?'':`
    float weather=vnoise(vW.xz*1.3+vW.y*.7);
    float streak=vnoise(vec2(vW.x*.8+vW.z*.2,vW.y*.08));
    float stain=smoothstep(.63,.79,weather)*smoothstep(.51,.72,streak);
    diffuseColor.rgb=mix(diffuseColor.rgb,${L('#bd9964')},stain*.42);
  `});
  const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function giantConch(){
  const root=new THREE.Group(),L=21,R0=6.8,outer=[],oc=[],inner=[],ic=[],lip=[],lc=[];
  const emit=(out,cols,a,b,c,color)=>{for(const p of[a,b,c]){out.push(p.x,p.y,p.z);cols.push(color.r,color.g,color.b);}};
  const quad=(out,cols,a,b,c,d,color)=>{emit(out,cols,a,b,c,color);emit(out,cols,a,c,d,color);};
  const ring=(t,a,inner=false)=>{
    const r=(.16+R0*Math.pow(t,1.18))*(1+.135*Math.cos(t*34+a));
    const flare=smooth(.87,1,t),sy=Math.sin(a),cz=Math.cos(a),rr=(r-(inner?.36:0))*(1+flare*.12*Math.max(0,-sy));
    const ridge=(inner?0:.10)*Math.cos(a*13+t*4)*Math.pow(t,.8);
    return new V3(L*(t-.5)+flare*((1-sy)*2.1+.30*Math.sin(a*3)),2.5+4.7*Math.pow(t,1.15)+(rr+ridge)*sy*1.08,(rr+ridge)*cz*.81);
  };
  const n=150,k=64;
  for(let i=0;i<n;i++)for(let j=0;j<k;j++){
    const t=i/n,t1=(i+1)/n,a=j/k*Math.PI*2,b=(j+1)/k*Math.PI*2;
    const rib=.5+.5*Math.cos(t*34+a),tone=new THREE.Color('#eee0bf').lerp(new THREE.Color('#c6ae83'),Math.pow(rib,8)*.30);
    tone.multiplyScalar(1+R(-.028,.028));
    quad(outer,oc,ring(t,a),ring(t1,a),ring(t1,b),ring(t,b),tone);
  }
  // The aperture is a real inner surface with a deep warm recess, not a painted disk.
  for(let i=0;i<44;i++)for(let j=0;j<k;j++){
    const t=.44+i/44*.56,t1=.44+(i+1)/44*.56,a=j/k*Math.PI*2,b=(j+1)/k*Math.PI*2;
    const tone=new THREE.Color('#a95f48').lerp(new THREE.Color('#e8ad87'),smooth(.46,1,t));
    tone.lerp(new THREE.Color('#f1c6a3'),Math.pow(.5+.5*Math.cos(a*9+t*4),8)*.16);
    quad(inner,ic,ring(t,b,true),ring(t1,b,true),ring(t1,a,true),ring(t,a,true),tone);
  }
  for(let j=0;j<k;j++){
    const a=j/k*Math.PI*2,b=(j+1)/k*Math.PI*2;
    quad(lip,lc,ring(1,a),ring(1,b),ring(1,b,true),ring(1,a,true),new THREE.Color(j%7===0?'#ddba8e':'#f7e6c3'));
  }
  // Seal the small recess at the narrow end of the inner chamber.
  for(let j=0;j<k;j++)emit(inner,ic,new V3(L*(.44-.5),2.5+4.7*Math.pow(.44,1.15),0),ring(.44,j/k*6.283,true),ring(.44,(j+1)/k*6.283,true),new THREE.Color('#a1624d'));
  root.add(shellMesh(outer,oc),shellMesh(inner,ic,true),shellMesh(lip,lc));
  // Unequal worn spines along the shoulder provide the conch's recognisable crown.
  for(let i=0;i<8;i++){
    const t=.34+i*.079,a=1.28+Math.sin(i*1.7)*.14,p=ring(t,a),rad=.18+.23*t,h=.3+.55*t;
    const g=new THREE.ConeGeometry(rad,h,5,1);g.translate(0,h*.35,0);
    const m=new THREE.Mesh(g,paint({color:i%3?'#e7d5b0':'#d4bd96',shade:[.60,.57,.53],mid:[.88,.82,.74]}));m.position.copy(p);m.rotation.z=-.32;m.castShadow=true;root.add(m);
  }
  const[x,z]=P(.60,.454,0);root.position.set(x,height(x,z)+.8,z-3.4);root.rotation.y=-.76;
  root.updateMatrixWorld(true);
  for(let t=.15;t<=1;t+=.085){const p=ring(t,Math.PI),q=root.localToWorld(new V3(p.x,0,0));COLLIDERS.push({x:q.x,z:q.z,r:(.16+R0*Math.pow(t,1.18))*.69+.15});}
  root.name='Singing Conch — hollow shell';return root;
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
  // Tall, irregular sea stacks frame the view while the middle remains a beach.
  const specs=[[.025,.79,.055,.72],[.09,.79,.065,.68],[.135,.84,.052,.67],[.215,.82,.034,.75],[.66,.82,.05,.72],[.735,.89,.055,.78],[.80,.92,.04,.83],[.90,.91,.025,.86],
    [.15,.68,.028,.62],[.35,.57,.03,.53],[.61,.45,.03,.40],[.82,.52,.032,.46],[.39,.42,.023,.38],[.88,.76,.025,.71],[.535,.505,.025,.455],[.58,.52,.025,.48],[.74,.54,.03,.49],[.79,.52,.022,.48]];
  for(const[u,v,hu,vt]of specs){
    const[x,z0]=P(u,v),w=wide(u-hu/2,u+hu/2,v,0),g=height(x,z0),h=Math.max(.8,tall(x,z0,g,vt)),d=w*.72,z=z0-d*.22;
    addStone(x,g-.18,z,w,h,d,{chamfer:.18,extra:18,jitter:.11,moss:.18,noLine:true,base:pick(['#cac6b0','#ded7bc','#bab9a4'])});
    if(z>zShore(x)-1){if(seaRocks.length<8)seaRocks.push([x,z,w*.42]);}
    else COLLIDERS.push({x,z,r:w*.4});
    if(h>2&&rand()<.7)addBush(x,g+h-.16,z,w*.25,{sy:.32,tint:.2});
    for(let i=0;i<3;i++){const xx=x+R(-.75,.75)*w,zz=z+R(-.5,.5)*d,ss=R(.17,.34)*w;addStone(xx,height(xx,zz)-.08,zz,ss,ss*R(.5,.9),ss*.9,{chamfer:.25,extra:7,noLine:true});}
  }
  for(let i=0;i<110;i++){
    const[u,v]=[R(.08,.94),R(.38,.83)],[x,z]=P(u,v),f=field(x,z);
    if(f.top>.15||z>zShore(x)-.8||(u>.44&&u<.81&&v<.51))continue;
    const r=R(.09,.30);addStone(x,height(x,z)-.04,z,r*1.5,r,r*1.2,{extra:4,chamfer:.3,noLine:true,moss:0});
  }
  while(seaRocks.length<8)seaRocks.push([9999,9999,.1]);
}
function plantCoast(){
  // The same leaf cards and trunks as the approved game scenes.
  const palms=[[.04,.34,7.8,-.15,3],[.39,.39,7.6,.3,2.6],[.87,.48,6.3,2.6,1.4],[.94,.70,8.0,3.4,3.2],[.92,.23,7.3,3.1,2],[.52,.09,7.7,-.6,2.5]];
  for(const[u,v,h,dir,lean]of palms){const[x,z]=P(u,v,height(...P(u,v,0)));palm(x,z,{h,dir,lean,fronds:10,droop:.8});COLLIDERS.push({x,z,r:.7});}
  const trees=[[.01,.29,1.6,3],[.15,.22,1.65,5],[.29,.27,1.8,9],[.32,.14,1.65,3],[.45,.12,1.6,5],[.57,.08,1.7,9],[.68,.19,1.75,5],[.80,.18,1.6,3],[.94,.19,1.8,9],[.98,.41,1.65,3],[-.03,.57,1.55,5]];
  for(const[u,v,sc,seed]of trees){const[x,z]=P(u,v,height(...P(u,v)));broadleaf(x,z,sc,seed);}
  for(let i=0;i<520;i++){
    const[x,z]=P(R(-.12,1.12),R(-.15,.75)),f=field(x,z);
    if(f.top<.90||trailEdge(x,z)<1.0||stairsAt(x,z).inside)continue;
    addBush(x,height(x,z)-.12,z,R(.8,1.7),{sy:R(.55,.9),tint:.1});
  }
  for(let i=0;i<10500;i++){
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
    const items=treeItems.filter(t=>t.v===v).map(t=>({...t,y:t.y+3.5*t.s}));if(!items.length)continue;
    const mesh=place(new THREE.InstancedMesh(animeFoliage(seed,false),leafMat(false),items.length),items,it=>new V3(3*it.s,2*it.s,2.7*it.s));mesh.customDepthMaterial=leafDepth(false);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
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
  for(const[u,v,r,c]of[[.40,.465,.8,true],[.51,.445,.9,false],[.665,.49,1,true],[.70,.50,.9,true],[.35,.60,.8,true],[.60,.78,.85,true],[.88,.79,.6,false]]){
    const[x,z]=P(u,v),s=scallop(r*1.6,c);s.position.set(x,height(x,z)+.04,z);s.rotation.y=R(-.6,.6);scene.add(s);
  }
  const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);
  placeCoastPlants();scene.add(giantConch());
  scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));scene.add(buildSea());setStatus();
}
function updateAmbience(){}
