// Frontier Settlement (Greenhollow Frontier): a village round a square of trodden earth: four timber-
// framed cottages with tiled roofs, the market cottage with its stall and banner, the bell tower on its
// stone base, the great tree on its island of grass with benches and barrels, a fenced vegetable
// garden, dry-stone walls, a stone stair up the bank at the top left. Roads leave south, north-west
// up the stair, north and north-east.
function onGround(u,v){
 let hi=M(9),lo=hi;
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
function barrel(x,z,r=M(.32),h=M(.75)){
 const y=height(x,z),g=new THREE.CylinderGeometry(r*.92,r*.92,h,12);g.translate(x,y+h/2,z);woodParts.push(coloredPart(g,'#8c6a44'));
 for(const t of[.18,.82]){const b=new THREE.TorusGeometry(r*.95,M(.03),4,14);b.rotateX(Math.PI/2);b.translate(x,y+h*t,z);woodParts.push(coloredPart(b,'#5a5248'));}
 const top=new THREE.CircleGeometry(r*.88,12);top.rotateX(-Math.PI/2);top.translate(x,y+h+.01,z);woodParts.push(coloredPart(top,'#a2814f'));
 COLLIDERS.push({x,z,r:r+.1});
}
const offPath=(x,z,pad)=>{const st=stairsAt(x,z);return st.s>st.half+pad&&(polyAt(PLAZA,x,z)??Infinity)>pad;};
const inHouse=(x,z,pad)=>COLLIDERS.some(c=>c.box&&Math.abs((x-c.x)*Math.cos(c.ry)-(z-c.z)*Math.sin(c.ry))<c.w/2+pad&&Math.abs((x-c.x)*Math.sin(c.ry)+(z-c.z)*Math.cos(c.ry))<c.d/2+pad);
function buildings(){
 cottage(.27,.43,{len:M(4.4),dep:M(3.2),wallH:M(1.75),roofH:M(1.6),ry:-.9,porch:true,chimney:1});
 cottage(.43,.165,{len:M(3.8),dep:M(2.9),wallH:M(1.6),roofH:M(1.45),ry:-.85,chimney:1});
 cottage(.81,.14,{len:M(3.4),dep:M(2.7),wallH:M(1.5),roofH:M(1.35),ry:-2.25,chimney:-1});
 cottage(.86,.49,{len:M(3.6),dep:M(2.8),wallH:M(1.55),roofH:M(1.4),ry:-2.25,chimney:-1});
 bellTower(.71,.255);
 stall(.47,.28,-.15,true);stall(.90,.585,.3);
 garden(.15,.60,.34,.72);
 // the great tree on its grass island in the square, benches and barrels at its foot
 rootTree(.61,.37,2.6,9);
 {const[x,,z]=onGround(.60,.475);bench(x,z,.15);}{const[x,,z]=onGround(.67,.44);barrel(x,z);}{const[x,,z]=onGround(.695,.425);barrel(x+M(.5),z);}
 {const[x,,z]=onGround(.30,.555);barrel(x,z);}{const[x,,z]=onGround(.92,.64);barrel(x,z);barrel(x+M(.7),z+M(.2));}
}
// dry-stone walls of rounded mossy stones along the lanes and round the garden, as the concept's
function stoneWalls(){
 for(const line of[[[.12,.79],[.20,.775],[.30,.765],[.38,.74],[.41,.69]],[[.64,.70],[.72,.69],[.80,.70],[.87,.74]],[[.55,.28],[.58,.30],[.64,.31],[.70,.30]],[[.86,.22],[.92,.25],[.97,.30]],[[.24,.10],[.30,.09],[.35,.06]]]){
  const pts=line.map(([u,v])=>{const[x,,z]=onGround(u,v);return new V3(x,0,z);}),curve=new THREE.CatmullRomCurve3(pts),n=Math.max(2,Math.round(curve.getLength()/M(.75)));
  for(let i=0;i<=n;i++){const p=curve.getPoint(i/n),st=stairsAt(p.x,p.z);if(st.s<st.half+M(.4))continue;const y=height(p.x,p.z),w=M(R(.6,.85));
   fieldStone(p.x,y-M(.25),p.z,w,M(R(.55,.8)),w*R(.7,.9),{ry:R(0,3),moss:.6,chamfer:R(.4,.55)});COLLIDERS.push({x:p.x,z:p.z,r:w*.42});
   if(rand()<.4)addBush(p.x,y+M(.3),p.z+M(.2),M(R(.22,.35)),{sy:.6,tint:R(-.1,.2)});}
 }
 for(let i=0;i<180;i++){
  const[x,y,z]=onGround(R(.02,.98),R(.08,1.04));
  if(field(x,z).rock>.2||stairsAt(x,z).inside||inHouse(x,z,M(.3)))continue;
  const r=R(.08,.3);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.3,noLine:true,moss:.12});
 }
}
function plantVillage(){
 for(const[u,v,s,seed]of[[.06,.45,3.0,5],[.03,.12,3.0,9],[.16,.0,2.6,3],[.30,.0,2.6,9],[.52,.02,2.4,5],[.63,.02,2.6,3],[.75,.0,2.6,9],[.95,.02,3.0,5],[.97,.30,2.8,3],[.08,.62,2.6,9],[.96,.78,2.6,5],[.40,-.02,2.4,3]]){
  const[x,,z]=onGround(u,v);
  if(!offPath(x,z,M(.6))||inHouse(x,z,M(1.2)))continue;
  rootTree(u,v,s*.8,seed);
 }
 for(let i=0;i<1500;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(!offPath(x,z,M(.6))||inHouse(x,z,M(.6)))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  const f=field(x,z),edge=trailEdge(x,z);
  if(f.top<.3&&edge<M(2.4)&&rand()<.7)continue;
  addBush(x,y-.1,z,R(.6,1.2),{sy:R(.55,.85),tint:R(-.1,.15)});
 }
 for(let i=0;i<9000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||inHouse(x,z,M(.2)))continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.32)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.55?'#f7da54':'#fff6dc'});
 }
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...ruinPalette);
function clearPaths(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if(item.y>height(item.x,item.z)+M(.6))continue;   // ivy on the walls
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||inHouse(item.x,item.z,0)||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.83);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();
 buildings();stoneWalls();plantVillage();finishHouses();
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),barkPaint());roots.castShadow=roots.receiveShadow=true;scene.add(roots);}
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearPaths();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
