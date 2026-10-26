// Gull Headland: a stone gate court on the headland top, reached by a curbed stair, the sea below.
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
 // along the outer side of the west path's climb, and on the clifftop by the sea
 const west=ROUTES.find(r=>r.id==='west');
 const side=(r,s)=>[r.x+r.nx*s*(r.w/2+M(.3)),r.z+r.nz*s*(r.w/2+M(.3))];
 for(const[from,to,s]of[[.30,.46,1],[.15,.27,1],[.82,.95,-1]]){const pts=west.rows.filter((r,i)=>i/west.n>=from&&i/west.n<=to&&i%3===0).map(r=>side(r,s));if(pts.length>1)fenceRun(pts);}
 fenceRun([[.775,.31],[.80,.295],[.825,.285],[.85,.275]].map(([u,v])=>P(u,v,PL)));
 fenceRun([[.79,.655],[.805,.62],[.815,.59]].map(([u,v])=>P(u,v,M(1.5))));
}
// sea stacks off the headland: [u, v at the waterline, width as a screen fraction, top v]
const SEA_STACKS=[[.93,.23,.04,.12],[.95,.40,.045,.27],[.985,.53,.03,.44],[.99,.76,.035,.66],[.975,.18,.02,.13],[.96,.47,.02,.42],[.60,.07,.03,.02],[.80,.085,.025,.03],[.70,.03,.02,.0]];
const seaRocks=[];
function seaStacks(){
 // tall columnar stacks: three blocks each a little narrower, mossy on top, as the reference's
 for(const[u,v,w,vt]of SEA_STACKS){
  const[x,z]=P(u,v,SEA_Y),width=wide(u-w/2,u+w/2,v,SEA_Y),h=tall(x,z,SEA_Y,vt)+M(.8),ry=R(-.5,.5);
  let y=SEA_Y-M(.8);
  for(let k=0;k<3;k++){const hh=h*[.42,.34,.24][k],ww=width*[1,.86,.7][k];block(x+R(-.1,.1)*width,y,z+R(-.1,.1)*width,ww,hh*1.02,ww*R(.75,.9),ry+R(-.15,.15),k===2?.65:.25,{base:pick(ruinPalette)});y+=hh;}
  addBush(x,y-.1,z,width*.35,{sy:.45,tint:R(-.3,.1)});
  const[s,d]=seaQ(x,z);seaRocks.push([s,d,width*.55]);
 }
 while(seaRocks.length<8)seaRocks.push([0,-999,0]);
}
function scatteredRocks(){
 // big mossy blocks at the front and along the tiers, as the reference's
 for(const[u,v,w,h]of[[.21,.885,.05,.065],[.33,.83,.035,.05],[.36,.765,.035,.05],[.40,.68,.03,.045],[.635,.865,.045,.06],[.72,.82,.045,.065],[.665,.94,.035,.045],[.91,.86,.045,.06],[.55,.66,.025,.04],[.69,.705,.02,.03],[.46,.42,.02,.035],[.30,.27,.02,.035]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5)continue;
  addStone(x,y-M(.25),z,width*R(.75,.9),hh*R(.85,1.05)+M(.25),width*R(.55,.75),{extra:9,chamfer:.09,jitter:.13,moss:.5,base:pick(ruinPalette),ry:R(-.9,.9)});COLLIDERS.push({x,z,r:width*.42});
 }
 for(let i=0;i<160;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.10,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||y<-.5||seaDist(x,z)>-1)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.08});
 }
}
function curbs(){
 // low stone curbs edge the curbed stair, as the reference's
 const route=ROUTES.find(r=>r.id==='stair');
 route.rows.forEach((r,i)=>{if(i%3)return;for(const s of[-1,1]){const off=s*(r.w/2+M(.08)),x=r.x+r.nx*off,z=r.z+r.nz*off;block(x,r.y-.12,z,M(.2),M(.2),M(.5),Math.atan2(r.ux,r.uz)+R(-.05,.05),.15,{base:pick(['#cfc7b5','#c4bca9','#d8d0bd'])});}});
}
function plantHeadland(){
 const trees=[[.035,.20,2.2,3],[.07,.05,2.1,9],[.03,.75,2.3,5],[.10,.93,2.3,3],[.355,.14,2.1,9],[.445,.03,2.0,5],[.36,.02,2.0,3],[.12,.58,1.9,5],[.25,.62,1.7,3],[.02,.46,2.0,9],[.60,.98,1.8,9],[.80,.97,2.0,3],[.17,.12,2.0,5],[.24,.05,2.0,9],[.81,.37,1.8,3],[.06,.36,2.0,3],[.92,.93,2.1,9],[.27,.40,1.6,5]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(y<-.3||seaDist(x,z)>-1.5)continue;
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03)continue;
  if(Math.hypot(x-GATE.x,z-GATE.z)<GATE.span*1.2)continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.38});
 }
 for(const[u,v,h,dir,lean]of[[.875,.25,M(2.6),-.6,M(.8)],[.835,.59,M(2.4),-.9,M(.6)]]){const[x,y,z]=onGround(u,v);palm(x,z,{h,dir,lean,fronds:9,droop:.8});COLLIDERS.push({x,z,r:.6});}
 for(let i=0;i<1600;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(y<-.3||seaDist(x,z)>-1||trailEdge(x,z)<M(.6)||field(x,z).rock>.35||polyAt(PLAZA,x,z)<M(.5))continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.7,1.35),{sy:R(.55,.85),tint:R(-.04,.2)});
 }
 for(let i=0;i<7000;i++){
  const[x,z]=[R(GX0*.8,GX1*.8),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(y<-.3||seaDist(x,z)>-1||trailEdge(x,z)<.35||f.rock>.10)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.38)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.65?'#f7da54':'#fff6dc'});
 }
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...ruinPalette);
function clearCourt(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],st=stairsAt(item.x,item.z),radius=Math.max(item.sx||item.s||.1,item.sz||item.s||.1)*.60;
  if((polyAt(PLAZA,item.x,item.z)??1)<-.2||(st.s<st.half+radius+.28&&Math.abs(item.y-st.y)<M(.75)))list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.497,.875);HERO.x=x;HERO.z=z;HERO.face=-2.9;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();scene.add(stoneGate());
 stoneLantern(.55,.215);stoneLantern(.735,.22);stoneCircle();standingStones();curbs();
 seaStacks();scene.add(buildSea());fences();scatteredRocks();plantHeadland();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);if(stoneLines.length)scene.add(new THREE.Mesh(mergeGeometries(stoneLines),outlineMat('#4c4852')));
 // palm trunks come indexed and with uvs; the fence parts do not: one layout before merging
 for(let i=0;i<woodParts.length;i++){let g=woodParts[i];if(g.index)g=g.toNonIndexed();if(g.attributes.uv)g.deleteAttribute('uv');woodParts[i]=g;}
 clearCourt();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){}
