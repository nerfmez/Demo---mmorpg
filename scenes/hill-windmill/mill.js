// Original game-native geometry for the reference's timber/plaster windmill.
let MILL=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
function millModel(){
 const body=new THREE.Group(),parts={wall:[],wood:[],roof:[],detail:[]};
 const materials={
  wall:paint({vertexColors:true,shade:[.61,.57,.48],mid:[.89,.84,.72],band:[-.2,.28],albedo:`float w=vnoise(vW.xz*2.+vW.y*.8);diffuseColor.rgb*=.96+.08*w;`}),
  wood:paint({vertexColors:true,shade:[.54,.48,.40],mid:[.83,.72,.55],band:[-.2,.30]}),
  roof:paint({vertexColors:true,shade:[.52,.43,.34],mid:[.82,.66,.48],band:[-.2,.30]}),
  detail:paint({vertexColors:true,shade:[.55,.53,.47],mid:[.85,.80,.69]})
 };
 const add=(g,color,position=new V3(),rotation=new THREE.Quaternion(),kind='wood',target=parts)=>{
  target[kind].push(coloredPart(g,color,new THREE.Matrix4().compose(position,rotation,new V3(1,1,1))));
 };
 const box=(x,y,z,w,h,d,color,kind='wood',ry=0)=>add(new THREE.BoxGeometry(w,h,d),color,new V3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry),kind);
 const beam=(a,b,w,d,color,target=parts,kind='wood')=>{const delta=b.clone().sub(a);add(new THREE.BoxGeometry(w,delta.length(),d),color,a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),delta.normalize()),kind,target);};
 const[x,z]=P(.602,.326,PL),r=wide(.565,.66,.373,PL)/2,h=tall(x,z,PL,.212),roofH=tall(x,z,PL+h,.120),R=r*1.13;
 body.position.set(x,PL,z);
 add(new THREE.CylinderGeometry(r*.88,r,h,12,1), '#e6dcc1',new V3(0,h/2,0),undefined,'wall');
 // Slightly uneven masonry plinth and dressed corners around the doorway.
 for(let j=0;j<3;j++)for(let i=0;i<20;i++){
  const a=(i+(j%2)*.5)/20*Math.PI*2,rr=r+.035,y=.16+j*.30;
  box(Math.sin(a)*rr,y,Math.cos(a)*rr,.58,.27,.17,pick(['#c6bda5','#d4cbb5','#bbb59f']),'wall',a);
 }
 for(const y of[h*.56,h*.91]){
  add(new THREE.CylinderGeometry(r*(1-y/h*.12)+.07,r*(1-y/h*.12)+.07,.16,12,1,true),'#73583d',new V3(0,y,0),undefined,'wood');
 }
 for(let i=0;i<12;i++){
  const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2,point=(aa,yy)=>new V3(Math.sin(aa)*r*(1-yy/h*.12),yy,Math.cos(aa)*r*(1-yy/h*.12));
  beam(point(a,h*.56),point(a,h*.94),.18,.18,'#765d40');
  if(i%2===0)beam(point(a,h*.60),point(b,h*.89),.13,.13,'#8a704b');
 }
 // Arched timber door, separate inset boards and a pale stone surround.
 const doorW=r*.40,doorH=h*.34,front=r+.035;
 box(0,doorH*.48,front,doorW,doorH,.15,'#483c30','detail');
 for(let i=0;i<5;i++)box(-doorW*.4+i*doorW*.2,doorH*.45,front+.105,doorW*.19,doorH*.88,.08,i%2?'#99734d':'#846343');
 for(const s of[-1,1])for(let j=0;j<4;j++)box(s*(doorW/2+.14),.19+j*(doorH*.79/4),front+.08,.23,doorH*.79/4-.025,.27,pick(['#c7bea6','#ddd4bc']),'wall');
 const cy=doorH*.80,ar=doorW*.56;
 for(let i=0;i<9;i++){
  const a=i/9*Math.PI,b=(i+1)/9*Math.PI,aa=(a+b)/2,g=new THREE.BoxGeometry(ar*Math.PI/9*.9,.24,.27),q=new THREE.Quaternion().setFromAxisAngle(new V3(0,0,1),aa-Math.PI/2);
  add(g,pick(['#d8cdb4','#beb59e','#e1d6bc']),new V3(Math.cos(aa)*ar,cy+Math.sin(aa)*ar,front+.08),q,'wall');
 }
 box(0,doorH*.34,front+.18,doorW*.85,.07,.06,'#574b3d');
 box(0,doorH*.69,front+.18,doorW*.85,.07,.06,'#574b3d');
 add(new THREE.TorusGeometry(.10,.025,5,12),'#bc9a58',new V3(doorW*.24,doorH*.43,front+.25),undefined,'detail');
 const window=(a,y,w,hh)=>{
  const rr=r*(1-y/h*.12)+.06,x=Math.sin(a)*rr,z=Math.cos(a)*rr;
  box(x,y,z,w,hh,.12,'#31483f','detail',a);
  const frame=(dx,dy,ww,ht)=>box(x+Math.cos(a)*dx,y+dy,z-Math.sin(a)*dx,ww,ht,.20,'#856443','wood',a);
  frame(-w*.55,0,.10,hh+.2);frame(w*.55,0,.10,hh+.2);frame(0,hh*.55,w+.18,.10);frame(0,-hh*.55,w+.18,.10);frame(0,0,.07,hh);
  frame(0,-hh*.69,w+.30,.17);
 };
 window(-.62,h*.33,r*.27,h*.21);window(.78,h*.39,r*.27,h*.20);window(.16,h*.73,r*.24,h*.16);
 add(new THREE.ConeGeometry(R*.99,roofH,12),'#76553b',new V3(0,h+roofH/2,0),undefined,'roof');
 // Individual staggered shingle courses preserve the curved, fully visible cap.
 const roofPos=[],roofCol=[],roofTone=['#735438','#8a6342','#98704a','#a47a50','#815b3b'];
 const triangle=(a,b,c,col)=>{for(const p of[a,b,c]){roofPos.push(p.x,p.y,p.z);roofCol.push(col.r,col.g,col.b);}};
 const layers=15,sectors=32;
 for(let j=0;j<layers;j++)for(let i=0;i<sectors;i++){
  const f0=j/layers,f1=(j+1)/layers,a=(i+(j%2)*.5)/sectors*Math.PI*2,b=a+Math.PI*2/sectors*.985;
  const rr=f=>R*Math.pow(1-f,.82)+.05,p=(f,a)=>new V3(Math.sin(a)*rr(f),h+roofH*f+(f===f0?.025:0),Math.cos(a)*rr(f));
  const A=p(f0,a),B=p(f0,b),C=p(f1,b),D=p(f1,a),tone=new THREE.Color(roofTone[(i+j*3)%roofTone.length]);
  triangle(A,B,C,tone);triangle(A,C,D,tone);
 }
 const roofGeo=new THREE.BufferGeometry();roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(roofPos,3));roofGeo.setAttribute('color',new THREE.Float32BufferAttribute(roofCol,3));roofGeo.computeVertexNormals();parts.roof.push(roofGeo);
 // Eave trim follows the polygon; the crown finishes in a small finial.
 for(let i=0;i<12;i++){const a=i/12*6.283,b=(i+1)/12*6.283;beam(new V3(Math.sin(a)*R,h,Math.cos(a)*R),new V3(Math.sin(b)*R,h,Math.cos(b)*R),.14,.18,'#5d4733');}
 add(new THREE.ConeGeometry(.17,.72,8),'#735331',new V3(0,h+roofH+.30,0),undefined,'wood');
 // Four framed linen sails, each with a visible wooden lattice.
 const rotor=new THREE.Group(),rotorParts={wood:[],wall:[],roof:[],detail:[]},hubZ=r*1.18,hubY=tall(x,z+hubZ,PL,.181),length=r*2.43,width=r*.46;
 rotor.position.set(-r*.20,hubY,hubZ);
 beam(new V3(0,hubY,r*.35),new V3(-r*.20,hubY,hubZ+.05),.23,.23,'#73583c');
 for(let i=0;i<4;i++){
  const angle=i*Math.PI/2,rot=new THREE.Matrix4().makeRotationZ(angle),point=(xx,yy,zz=0)=>new V3(xx,yy,zz).applyMatrix4(rot);
  beam(point(0,-.18),point(0,length*1.055),.17,.20,'#705638',rotorParts);
  const lo=length*.27,hi=length,near=.04,far=width;
  for(let j=0;j<6;j++){
   const y0=lo+(hi-lo)*j/6,y1=lo+(hi-lo)*(j+1)/6;
   for(let k=0;k<2;k++){
    const x0=near+(far-near)*k/2,x1=near+(far-near)*(k+1)/2;
    const A=point(x0+.035,y0+.035,-.015),B=point(x1-.035,y0+.035,-.015),C=point(x1-.035,y1-.035,-.015),D=point(x0+.035,y1-.035,-.015),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([...A.toArray(),...B.toArray(),...C.toArray(),...A.toArray(),...C.toArray(),...D.toArray()],3));g.computeVertexNormals();rotorParts.wall.push(coloredPart(g,(i+j+k)%4?'#f2e3bd':'#e3d1a7'));
   }
  }
  beam(point(near,lo),point(near,hi),.10,.13,'#9d794c',rotorParts);beam(point(far,lo),point(far,hi),.11,.14,'#81613e',rotorParts);
  for(let j=0;j<=6;j++){const y=lo+(hi-lo)*j/6;beam(point(-.20,y),point(far+.12,y),.095,.13,'#8f6c44',rotorParts);}
  beam(point(width*.50,lo),point(width*.50,hi),.06,.09,'#ac8958',rotorParts);
 }
 add(new THREE.CylinderGeometry(.33,.39,.35,12),'#8f6f48',new V3(0,0,.17),new THREE.Quaternion().setFromAxisAngle(new V3(1,0,0),Math.PI/2),'wood',rotorParts);
 add(new THREE.TorusGeometry(.26,.035,5,16),'#c1a36a',new V3(0,0,.37),undefined,'detail',rotorParts);
 const finish=(map,group)=>{for(const[k,arr]of Object.entries(map))if(arr.length){const mat=materials[k];if(k==='wall'&&group===rotor)mat.side=THREE.DoubleSide;const mesh=new THREE.Mesh(mergeGeometries(arr),mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}};
 materials.sail=paint({vertexColors:true,side:THREE.DoubleSide,shade:[.82,.76,.64],mid:[1,.96,.85],band:[-.25,.3]});
 finish(parts,body);materials.wall=materials.sail;finish(rotorParts,rotor);rotor.scale.setScalar(.77);rotor.rotation.z=Math.PI/4;body.add(rotor);
 COLLIDERS.push({x,z,r:r*.98});
 MILL={root:body,rotor,x,z,r,door:{x,z:z+r+.65},hubY};
 return body;
}
