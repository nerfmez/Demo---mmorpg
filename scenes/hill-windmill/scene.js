// Hill Windmill: broad looping routes, a fenced terrace, and game-native foliage.
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
 // A generous front gate opens onto the mill door.
 const pts=[];for(let i=0;i<=28;i++){const a=.70+(Math.PI*2-1.40)*i/28;pts.push([MILL.x+Math.sin(a)*MILL.r*2.45,MILL.z+Math.cos(a)*MILL.r*1.65]);}fenceRun(pts);
 for(const[id,side,from,to]of[['shortcut',-1,.24,.91],['right',1,.35,.78]]){
  const route=ROUTES.find(r=>r.id===id),pts=route.rows.filter((r,i)=>i/route.n>=from&&i/route.n<=to&&i%3===0).map(r=>[r.x+r.nx*side*(r.w/2+M(.26)),r.z+r.nz*side*(r.w/2+M(.26))]);
  if(pts.length>1)fenceRun(pts);
 }
}
function millProps(){
 // Crates, sacks and a barrel beside the entrance, not across its approach.
 for(const[dx,dz,s,y]of[[-1.32,.76,1.1,0],[-1.54,.83,.86,0],[-1.35,.78,.76,1.10]]){
  const x=MILL.x+MILL.r*dx,z=MILL.z+MILL.r*dz,base=height(x,z)+y;
  woodBox(x,base+s/2,z,s,s,s,'#aa8653',-.08);
  for(const sign of[-1,1])woodBox(x+sign*s*.39,base+s/2,z+s*.51,.10,s,.08,'#795c36');
  woodBox(x,base+s*.12,z+s*.51,s,.10,.10,'#785c36');woodBox(x,base+s*.88,z+s*.51,s,.10,.10,'#785c36');
  if(y===0)COLLIDERS.push({x,z,r:s*.60});
 }
 for(let i=0;i<3;i++){
  const x=MILL.x+MILL.r*(1.17+i*.15),z=MILL.z+MILL.r*(.65+Math.sin(i)*.17),y=height(x,z),g=new THREE.SphereGeometry(.45,7,5);g.scale(1,.95,.75);g.translate(x,y+.39,z);stoneParts.push(coloredPart(g,i%2?'#beaa77':'#cbbc90'));
 }
 const x=MILL.x-MILL.r*1.45,z=MILL.z+MILL.r*.40,y=height(x,z),g=new THREE.CylinderGeometry(.37,.40,.95,10);g.translate(x,y+.475,z);woodParts.push(coloredPart(g,'#967344'));
 for(const h of[.20,.73]){const g=new THREE.CylinderGeometry(.413,.413,.065,10,1,true);g.translate(x,y+h,z);woodParts.push(coloredPart(g,'#6f705c'));}
}
function scatteredRocks(){
 for(const[u,v,w,h]of[[.08,.81,.028,.04],[.15,.91,.04,.06],[.24,.69,.023,.035],[.36,.72,.023,.04],[.43,.68,.023,.035],[.59,.72,.025,.036],[.68,.74,.025,.04],[.81,.61,.023,.035],[.84,.44,.025,.04],[.97,.75,.035,.07],[.16,.35,.022,.035],[.48,.32,.020,.03]]){
  const[x,y,z]=onGround(u,v),width=wide(u-w/2,u+w/2,v,y),hh=tall(x,z,y,v-h);
  if(stairsAt(x,z).s<stairsAt(x,z).half+width*.5+.5)continue;
  addStone(x,y-.08,z,width,hh,width*.73,{extra:13,chamfer:.22,moss:.38,noLine:true,base:pick(ruinPalette)});COLLIDERS.push({x,z,r:width*.4});
 }
 for(let i=0;i<180;i++){
  const[x,y,z]=onGround(R(.03,.98),R(.24,1.04)),f=field(x,z),st=stairsAt(x,z);
  if(f.rock>.2||st.inside||Math.hypot(x-MILL.x,z-MILL.z)<MILL.r*1.3)continue;
  const r=R(.10,.42);addStone(x,y-.06,z,r*1.6,r,r*1.1,{extra:5,chamfer:.26,noLine:true,moss:.08});
 }
}
function plantHill(){
 const trees=[[.02,.46,2.3,3],[.11,.35,2.4,5],[.12,.20,2.35,9],[.22,.16,2.15,3],[.33,.13,2.25,5],[.40,.24,2.25,9],[.47,.14,2.0,3],[.53,.08,2.3,5],[.66,.08,2.2,9],[.73,.16,2.2,5],[.80,.22,2.5,3],[.91,.22,2.6,9],[.98,.37,2.5,5],[.96,.59,2.3,3],[.98,.80,2.4,9],[.11,.75,2.5,3],[.015,.90,2.5,5],[.34,.58,1.9,9],[.38,.40,2.1,3],[.88,.92,2.0,5],[-.025,.60,2.0,9],[1.03,.63,2.6,3]];
 for(const[u,v,s,seed]of trees){
  let[x,y,z]=onGround(u,v),st=stairsAt(x,z);
  if(st.s<st.half+M(.65)&&st.a>-.03&&st.a<1.03){const route=ROUTES.find(r=>r.id===st.route),r=route.rows.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b),sign=(x-r.x)*r.nx+(z-r.z)*r.nz<0?-1:1;x=r.x+sign*r.nx*(r.w/2+M(1.15));z=r.z+sign*r.nz*(r.w/2+M(1.15));}
  if(Math.hypot(x-MILL.x,z-MILL.z)<MILL.r*1.8)continue;
  broadleaf(x,z,s,seed);COLLIDERS.push({x,z,r:s*.38});
 }
 for(let i=0;i<760;i++){
  const[x,y,z]=onGround(R(-.1,1.1),R(-.05,1.06));
  if(trailEdge(x,z)<M(.4)||field(x,z).rock>.35||Math.hypot(x-MILL.x,z-MILL.z)<MILL.r*1.7)continue;
  const g=Math.max(Math.abs(height(x+.4,z)-y),Math.abs(height(x,z+.4)-y))/.4;if(g>1.6)continue;
  addBush(x,y-.1,z,R(.85,1.75),{sy:R(.60,.95),tint:R(-.08,.12)});
 }
 for(let i=0;i<16000;i++){
  const[x,z]=[R(GX0*.78,GX1*.78),R(GZ0*.75,GZ1)],f=field(x,z),y=height(x,z);
  if(trailEdge(x,z)<.35||f.rock>.10||Math.hypot(x-MILL.x,z-MILL.z)<MILL.r*1.4)continue;
  const slope=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;if(slope>.65)continue;
  grassItems.push({x,y:y-.02,z,s:R(.6,1.05),ry:R(0,6.28),k:R(.9,1.08)});
  if(rand()<.22)flowerItems.push({x,y:y+.02,z,s:R(.65,.95),ry:R(0,6.28),c:rand()<.65?'#f7da54':'#fff6dc'});
 }
}
FOL.leaf=['#2a6e50','#5a963e','#b9ce4e'];FOL.shrub=['#2b6b4b','#5e9639','#acbf45'];STONE.splice(0,STONE.length,...ruinPalette);
function clearMillFront(){
 for(const list of[shrubItems,grassItems,flowerItems])for(let i=list.length-1;i>=0;i--){
  const item=list[i],p=new V3(item.x,item.y+(item.sy||.1)*.55,item.z).project(camera),u=(p.x+1)/2,v=(1-p.y)/2;
  if(u>.548&&u<.665&&v>.262&&v<.408)list.splice(i,1);
 }
}
function build(){
 const[x,z]=P(.50,.878);HERO.x=x;HERO.z=z;HERO.face=-2.7;
 scene.add(buildGround());scene.add(buildCliffs());buildLedges();scene.add(millModel());
 fences();millProps();scatteredRocks();plantHill();
 const stones=new THREE.Mesh(mergeGeometries(stoneParts),masonryMaterial());stones.customDepthMaterial=masonryDepth;stones.castShadow=stones.receiveShadow=true;scene.add(stones);
 clearMillFront();placeCoastPlants();scene.add(buildHero());loadHeroModel().catch(e=>console.error('hero model',e));setStatus();
}
function updateAmbience(t){if(MILL)MILL.rotor.rotation.z=Math.PI/4+(reduce?0:t*.055);}
