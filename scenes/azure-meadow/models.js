function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
// Original stone well, working windlass construction, garden props and village.
let WELL=null;
function detailMesh(g,color){g.deleteAttribute('uv');stoneParts.push(coloredPart(g,color));}
function ringStone(x,y,z,inner,outer,a,b,h,color){
 const shape=new THREE.Shape();shape.moveTo(Math.cos(a)*outer,Math.sin(a)*outer);shape.absarc(0,0,outer,a,b,false);shape.lineTo(Math.cos(b)*inner,Math.sin(b)*inner);shape.absarc(0,0,inner,b,a,true);shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelThickness:.045,bevelSize:.055,bevelSegments:1,curveSegments:2,steps:1});g.rotateX(-Math.PI/2);g.translate(x,y,z);detailMesh(g,color);
}
function cylinderWood(x,y,z,rt,rb,h,color='#97734b',open=false){const g=new THREE.CylinderGeometry(rt,rb,h,12,1,open);g.translate(x,y,z);woodParts.push(coloredPart(g,color));}
function barrel(x,z,r=.65,h=1.4,bucket=false,base=height(x,z)){
 cylinderWood(x,base+h/2,z,r,r*.88,h,bucket?'#9c7d50':'#8c704b',true);
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2;woodBeam(new V3(x+Math.sin(a)*r,base+.08,z+Math.cos(a)*r),new V3(x+Math.sin(a)*r*.99,base+h-.05,z+Math.cos(a)*r*.99),.035,'#5f4d34');}
 for(const t of[.18,.83]){const g=new THREE.TorusGeometry(r*(.89+.11*t),.045,5,16);g.rotateX(Math.PI/2);g.translate(x,base+h*t,z);detailMesh(g,'#77786b');}
 const g=new THREE.CircleGeometry(r*.86,12);g.rotateX(-Math.PI/2);g.translate(x,base+h*.15,z);detailMesh(g,'#3c382a');
 if(bucket){const c=new THREE.EllipseCurve(0,0,r*.96,r*.96,0,Math.PI,false,0),pts=c.getPoints(16).map(p=>new V3(x+p.x,base+h+p.y,z));woodParts.push(coloredPart(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,.035,5,false),'#665b43'));}
 else COLLIDERS.push({x,z,r:r+.05});
}
function wellModel(){
 const base=PL,[x,z]=P(.558,.375,base),r=wide(.503,.615,.38,base)/2,h=tall(x,z,base,.335),inner=r*.73;
 for(let row=0;row<3;row++)for(let i=0;i<18;i++){
  const a=(i+(row%2)*.5)/18*Math.PI*2+.008,b=a+Math.PI*2/18-.016;
  ringStone(x,base+row*h/3,z,inner,r,a,b,h/3-.045,pick(ruinPalette));
 }
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2+.006;ringStone(x,base+h-.04,z,inner-.06,r+.15,a,a+Math.PI*2/16-.012,.30,pick(['#d4ccb4','#e0d6bd','#c7c0ab']));}
 const water=new THREE.Mesh(new THREE.CircleGeometry(inner*.99,36),paint({color:'#274e50',side:THREE.DoubleSide,shade:[.62,.72,.75],mid:[.80,.91,.89]}));water.rotation.x=-Math.PI/2;water.position.set(x,base+h*.31,z);water.name='well-water';scene.add(water);
 const glint=new THREE.TorusGeometry(inner*.70,.035,3,28,Math.PI*.76);glint.rotateX(-Math.PI/2);glint.translate(x,base+h*.31+.02,z);detailMesh(glint,'#77aaa3');
 const top=tall(x,z,base,.255),post=r*.82,depth=.52;
 for(const side of[-1,1]){
  woodBox(x+side*post,base+top/2,z,.43,top,depth,'#a58a5d');
  woodBox(x+side*post,base+top+.12,z,.65,.28,.70,'#b59b6d');
  woodBeam(new V3(x+side*post,base+h+.30,z),new V3(x+side*post*.78,base+top-.42,z),.17,'#795e3e');
  for(const yy of[h+.40,top-.35]){const g=new THREE.SphereGeometry(.095,6,4);g.scale(1,1,.36);g.translate(x+side*post,base+yy,z+.29);detailMesh(g,'#6d6956');}
 }
 const axleY=base+top-.52,g=new THREE.CylinderGeometry(.26,.26,post*2+1.05,12);g.rotateZ(Math.PI/2);g.translate(x,axleY,z);woodParts.push(coloredPart(g,'#715b3d'));
 for(let i=0;i<12;i++){const g=new THREE.TorusGeometry(.31,.045,5,14);g.rotateY(Math.PI/2);g.translate(x-.42+i*.077,axleY,z);woodParts.push(coloredPart(g,'#c4af7d'));}
 const bucketBase=base+h*.57,bucketZ=z+.12;
 woodBeam(new V3(x,axleY-.30,z+.10),new V3(x,bucketBase+1.30,bucketZ),.07,'#b8a16f');
 barrel(x,bucketZ,.48,.78,true,bucketBase);
 woodBeam(new V3(x+post+.54,axleY,z),new V3(x+post+.54,axleY-.90,z),.15,'#705b3d');
 cylinderWood(x+post+.54,axleY-.90,z+.20,.15,.15,.38,'#9b7d51');
 WELL={x,z,r,h,base,approach:{x,z:z+r+.9}};COLLIDERS.push({x,z,r:r+.22});
 barrel(x-r-1.05,z+r*.25,.77,1.8);barrel(x+r+1.15,z+r*.34,.58,1.32,true);COLLIDERS.push({x:x+r+1.15,z:z+r*.34,r:.65});
}
function gardenWalls(){
 for(const T of TERRACES.filter(t=>t.masonry))for(const run of cliffRuns(T))for(let i=0;i<run.pts.length-1;i++){
  const A=run.pts[i],B=run.pts[i+1],dx=B.x-A.x,dz=B.z-A.z,len=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(len/M(.72))),yaw=Math.atan2(-dz,dx);
  for(let k=0;k<n;k++){
   const t=(k+.5)/n,x=A.x+dx*t,z=A.z+dz*t,st=stairsAt(x,z);if(st.s<st.half+.60)continue;
   const y=height(x,z)-.15,wallH=Math.max(M(.35),T.top+M(.20)-y)+.10*Math.sin(i*.91),course=wallH/2;
   for(let j=0;j<2;j++)block(x+(j?.16:0),y+j*course,z,len/n*.94,course-.04,M(.35),yaw,.14,{ink:.002*K,base:pick(ruinPalette)});
   COLLIDERS.push({x,z,r:M(.31)});
  }
 }
}
function gateAndVillage(){
 const y=M(.65),[x,z]=P(.87,.215,y),opening=wide(.843,.898,.20,y)/2+1.15,h=tall(x,z,y,.105),archY=h-opening*1.28,thick=M(.36),depth=M(.70);
 for(const side of[-1,1]){
  for(let row=0;row<6;row++)block(x+side*(opening+thick*.54),y+row*archY/6,z,thick,archY/6-.035,depth,0,.08,{ink:.004*K,base:pick(ruinPalette)});
  solidBox(x+side*(opening+thick*.54),z,thick,depth);
 }
 for(let i=0;i<13;i++){
  const a=i/13*Math.PI+.008,b=(i+1)/13*Math.PI-.008,ri=opening,ro=opening+thick;
  const p=(r,a,zz)=>new V3(x+Math.cos(a)*r,y+archY+Math.sin(a)*r,zz);
  const verts=[p(ri,a,z-depth/2),p(ro,a,z-depth/2),p(ro,b,z-depth/2),p(ri,b,z-depth/2),p(ri,a,z+depth/2),p(ro,a,z+depth/2),p(ro,b,z+depth/2),p(ri,b,z+depth/2)];
  const pos=[];for(const f of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]])for(const j of[0,1,2,0,2,3])pos.push(...verts[f[j]].toArray());
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();detailMesh(g,pick(ruinPalette));
 }
 const capY=y+Math.max(h,archY+opening+thick)+.12;
 block(x,capY,z,(opening+thick)*2+.25,.32,depth+.20,0,.05,{ink:.002*K,base:'#cec4ab'});
 for(const side of[-1,1]){
  const xx=x+side*(opening+thick*.58),bottom=y+archY;
  block(xx,bottom,z,thick*.92,Math.max(.15,capY-bottom),depth,0,.05,{ink:.002*K,base:'#c8bea7'});
 }
 for(const[u,v,w,hh,roof]of[[.62,.10,.060,.12,'#b97849'],[.69,.105,.057,.13,'#c18855'],[.745,.11,.045,.11,'#ad7248'],[.93,.08,.054,.12,'#bb8052'],[.98,.13,.05,.11,'#b57b4e'],[.78,.035,.052,.12,'#c48856']]){
  const[x,z]=P(u,v,y),width=wide(u-w/2,u+w/2,v,y),height1=tall(x,z,y,v-hh*.65),d=width*.80;
  woodBox(x,y+height1/2,z,width,height1,d,'#dfd2af');
  const yy=y+height1,rise=height1*.42,rr=width*.58,dd=d*.60,pos=[];
  const vtx=[[-rr,0,-dd],[rr,0,-dd],[0,rise,-dd],[-rr,0,dd],[rr,0,dd],[0,rise,dd]];
  for(const f of[[0,1,2],[3,5,4],[0,2,5,3],[1,4,5,2]])for(const j of(f.length===3?[0,2,1]:[0,2,1,0,3,2]))pos.push(x+vtx[f[j]][0],yy+vtx[f[j]][1],z+vtx[f[j]][2]);
  const roofGeo=new THREE.BufferGeometry();roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));roofGeo.computeVertexNormals();woodParts.push(coloredPart(roofGeo,roof));
  // Small overlapping tile bands retain roof detail at the distant camera.
  for(const side of[-1,1])for(let j=0;j<7;j++)for(let k=0;k<9;k++){
   const a=j/7,b=(j+1)/7,zz0=-dd+k/9*dd*2,zz1=zz0+dd*2/9*.95;
   const pts=[[a,zz0],[b,zz0],[b,zz1],[a,zz1]],p=[];
   for(const idx of(side>0?[0,1,2,0,2,3]:[0,2,1,0,3,2])){const[t,zz]=pts[idx];p.push(x+side*rr*(1-t),yy+rise*t+.035,z+zz);}
   const tile=new THREE.BufferGeometry();tile.setAttribute('position',new THREE.Float32BufferAttribute(p,3));tile.computeVertexNormals();
   const tone=new THREE.Color(roof).multiplyScalar(.88+((j+k)%4)*.055);woodParts.push(coloredPart(tile,tone));
  }

  for(const side of[-1,1])woodBox(x+side*width*.27,y+height1*.58,z+d*.51,width*.15,height1*.23,.09,'#43514a');
  woodBox(x,y+height1*.25,z+d*.51,width*.16,height1*.48,.12,'#80664a');
  for(const yy of[.47,.87])woodBox(x,y+height1*yy,z+d*.52,width,.10,.12,'#967b57');
  woodBox(x+width*.25,yy+rise*.66,z-dd*.32,width*.13,rise*.65,width*.14,'#d1c4a3');
  solidBox(x,z,width,d);
 }
}
