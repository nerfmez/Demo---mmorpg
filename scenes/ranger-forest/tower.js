// Original game-native geometry for the reference's ranger watchtower: a braced timber frame on
// the plateau, a railed lookout platform and a red tiled pyramid roof, with a ladder up its side.
let TOWER=null;
function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
function towerModel(){
 const group=new THREE.Group(),parts={wood:[],roof:[],dark:[]};
 const materials={
  wood:paint({vertexColors:true,shade:[.54,.47,.40],mid:[.84,.72,.55],band:[-.2,.30]}),
  roof:paint({vertexColors:true,shade:[.52,.36,.33],mid:[.86,.62,.52],band:[-.2,.30]}),
  dark:paint({vertexColors:true,shade:[.44,.39,.34],mid:[.70,.62,.50],band:[-.2,.30]})
 };
 const add=(g,color,position,rotation=new THREE.Quaternion(),kind='wood')=>parts[kind].push(coloredPart(g,color,new THREE.Matrix4().compose(position,rotation,new V3(1,1,1))));
 const box=(x,y,z,w,h,d,color,kind='wood',ry=0)=>add(new THREE.BoxGeometry(w,h,d),color,new V3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry),kind);
 const beam=(a,b,w,color,kind='wood')=>{const d=b.clone().sub(a);add(new THREE.BoxGeometry(w,d.length(),w),color,a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),d.normalize()),kind);};
 // sized from the reference: feet on the plateau, the platform and the roof where the image has them
 const[x,z]=P(.247,.228,PL),half=wide(.222,.272,.228,PL)/2,base=height(x,z)-.15;
 const deck=tall(x,z,base,.150),eave=tall(x,z,base,.105),apex=tall(x,z,base,.045);
 group.position.set(x,base,z);group.rotation.y=-.12;
 const legs=[[-1,-1],[1,-1],[1,1],[-1,1]],top=half*.86,lw=M(.17);
 const corner=(sx,sz,y,r)=>new V3(sx*r,y,sz*r);
 for(const[sx,sz]of legs)beam(corner(sx,sz,0,half),corner(sx,sz,deck+.1,top),lw,'#8a6a42');
 // cross bracing on each face, two storeys
 for(let k=0;k<4;k++){
  const[a0,a1]=[legs[k],legs[(k+1)%4]];
  for(const[y0,y1]of[[.08,.5],[.5,.94]]){
   const r0=half+(top-half)*y0,r1=half+(top-half)*y1;
   beam(corner(...a0,deck*y0,r0),corner(...a1,deck*y1,r1),lw*.62,'#9a7849');
   beam(corner(...a1,deck*y0,r0),corner(...a0,deck*y1,r1),lw*.62,'#93724a');
   beam(corner(...a0,deck*y1,r1),corner(...a1,deck*y1,r1),lw*.7,'#7f6140');
  }
 }
 // the platform: a plank floor wider than the frame, railed all round
 const pw=top*2.15;
 for(let i=0;i<7;i++){const t=-pw/2+(i+.5)*pw/7;box(t,deck+.08,0,pw/7*.94,M(.09),pw,i%2?'#a98552':'#b48f5a');}
 box(0,deck-.06,0,pw*1.02,M(.12),pw*1.02,'#6f5236','dark');
 const rail=M(.42);
 for(const[sx,sz]of legs)beam(corner(sx,sz,deck,pw/2*.97),corner(sx,sz,eave,pw/2*.93),lw*.8,'#86663f');
 for(let k=0;k<4;k++){
  const a=legs[k],b=legs[(k+1)%4],A=corner(...a,0,pw/2*.97),B=corner(...b,0,pw/2*.97);
  for(const h of[rail*.45,rail])beam(A.clone().setY(deck+h),B.clone().setY(deck+h),lw*.5,'#a27f4d');
  for(let i=1;i<5;i++){const p=A.clone().lerp(B,i/5);beam(p.clone().setY(deck+.05),p.clone().setY(deck+rail),lw*.38,'#94724a');}
 }
 // the roof: four tiled faces with a deep overhang, a ridge cap and a finial
 const rr=pw*.68,rh=apex-eave;
 const roof=new THREE.ConeGeometry(rr,rh,4,1,true);roof.rotateY(Math.PI/4);
 add(roof,'#c4553b',new V3(0,eave+rh/2,0),undefined,'roof');
 for(let row=1;row<5;row++){
  const f=row/5,r=rr*(1-f)*1.003,y=eave+rh*f;
  for(let k=0;k<4;k++){
   const a=k*Math.PI/2,c0=new V3(Math.sin(a)*r,y,Math.cos(a)*r),c1=new V3(Math.sin(a+Math.PI/2)*r,y,Math.cos(a+Math.PI/2)*r);
   beam(c0,c1,M(.05),row%2?'#a8442f':'#b54c34','roof');
  }
 }
 for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4;beam(new V3(Math.sin(a)*rr*1.02,eave-.02,Math.cos(a)*rr*1.02),new V3(0,apex,0),M(.09),'#9a3a28','roof');}
 add(new THREE.CylinderGeometry(M(.04),M(.07),M(.45),6),'#8a6a42',new V3(0,apex+M(.2),0));
 add(new THREE.SphereGeometry(M(.08),8,6),'#c9a25c',new V3(0,apex+M(.45),0));
 // the ladder on the stair side, from the plateau to the platform
 const lx=pw/2+M(.18),ly0=0,ly1=deck+.1,ls=M(.22);
 for(const s of[-1,1])beam(new V3(lx+M(.55),ly0,s*ls),new V3(lx,ly1,s*ls),lw*.6,'#8b6b42');
 for(let i=1;i<10;i++){const t=i/10;box(lx+M(.55)*(1-t),ly1*t,0,lw*.45,lw*.45,ls*2.1,'#a3814e');}
 for(const[kind,list]of Object.entries(parts)){if(!list.length)continue;const mesh=new THREE.Mesh(mergeGeometries(list),materials[kind]);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 group.updateMatrixWorld(true);
 for(const[sx,sz]of legs){const p=corner(sx,sz,0,half).applyMatrix4(group.matrixWorld);COLLIDERS.push({x:p.x,z:p.z,r:lw*1.3});}
 TOWER={x,z,y:base,r:half,deck:base+deck,group};
 return group;
}
