function coloredPart(g,color,matrix){
 if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
 if(matrix)g.applyMatrix4(matrix);
 const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<g.attributes.position.count;i++)colors.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
// Native gazebo geometry and a reusable, cupped 3D rose (no image sprites).
let GAZEBO=null;
const roseItems=[],vineLeafItems=[];
function addRose(p,s=0.26,color='#e7b5a3',normal=new V3(.1,.75,.65)){
 roseItems.push({x:p.x,y:p.y,z:p.z,s,color,normal:normal.clone().normalize(),roll:R(0,6.283)});
}
function roseGeometry(){
 const pos=[],col=[];
 for(const[n,r,len,y,lift,w]of[[8,.27,.70,.02,.25,.48],[6,.12,.55,.16,.38,.50],[4,.02,.34,.34,.38,.58]])for(let petal=0;petal<n;petal++){
  const angle=petal/n*6.283+y*4.1,tone=new THREE.Color().setRGB(.90+R(0,.10),.86+R(0,.12),.84+R(0,.14));
  const p=(u,t)=>{const a=angle+u*w*Math.pow(Math.sin(t*Math.PI),.65),rr=r+len*Math.sin(t*Math.PI*.5);return new V3(Math.sin(a)*rr,y+lift*Math.sin(t*Math.PI*.5)-.07*t*t+.10*u*u,Math.cos(a)*rr);};
  for(let row=0;row<3;row++)for(let k=0;k<3;k++){
   const u=-1+k*2/3,v=row/3,du=2/3,dv=1/3,A=p(u,v),B=p(u+du,v),C=p(u+du,v+dv),D=p(u,v+dv);
   for(const q of[A,B,C,A,C,D]){pos.push(q.x,q.y,q.z);col.push(tone.r,tone.g,tone.b);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
}
function placeRoses(){
 const mat=paint({vertexColors:true,side:THREE.DoubleSide,shade:[.56,.50,.52],mid:[.88,.78,.77],band:[-.25,.28]}),mesh=new THREE.InstancedMesh(roseGeometry(),mat,roseItems.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),roll=new THREE.Quaternion(),color=new THREE.Color();
 roseItems.forEach((it,i)=>{q.setFromUnitVectors(new V3(0,1,0),it.normal);roll.setFromAxisAngle(new V3(0,1,0),it.roll);q.multiply(roll);m.compose(new V3(it.x,it.y,it.z),q,new V3(it.s,it.s,it.s));mesh.setMatrixAt(i,m);mesh.setColorAt(i,color.set(it.color));});mesh.name='cupped-roses';mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
 const p=[0,0,0,-.40,.10,.45,0,.18,1.0,0,0,0,0,.18,1.0,.40,.10,.45],leaf=new THREE.BufferGeometry();leaf.setAttribute('position',new THREE.Float32BufferAttribute(p,3));leaf.computeVertexNormals();
 const leaves=new THREE.InstancedMesh(leaf,paint({color:'#69954b',side:THREE.DoubleSide,shade:[.48,.61,.47],mid:[.74,.86,.62]}),vineLeafItems.length);
 vineLeafItems.forEach((it,i)=>{q.setFromUnitVectors(new V3(0,1,0),it.normal);m.compose(it.p,q,new V3(it.s,it.s,it.s));leaves.setMatrixAt(i,m);});leaves.name='rose-vine-leaves';leaves.castShadow=leaves.receiveShadow=true;scene.add(leaves);
}
function gazeboModel(){
 const{x,z,r,rz}=PAVILION,H=tall(x,z,PL,.15),roofH=tall(x,z,PL+H,.065),roofR=r*1.15;
 const p=(a,rr=r,y=0)=>new V3(x+Math.sin(a)*rr,PL+y,z+Math.cos(a)*rr*.73);
 const floor=new THREE.CylinderGeometry(r*1.035,r*1.035,.20,6,1,false,Math.PI/6);floor.scale(1,1,.73);floor.translate(x,PL-.10,z);stoneParts.push(coloredPart(floor,'#c4b89b'));
 const hex=Array.from({length:6},(_,i)=>{const a=Math.PI/6+i/6*6.283;return[Math.sin(a)*r,Math.cos(a)*rz];});
 const clip=(poly,z0,keepAbove)=>{const out=[];for(let i=0;i<poly.length;i++){const A=poly[i],B=poly[(i+1)%poly.length],aa=keepAbove?A[1]>=z0:A[1]<=z0,bb=keepAbove?B[1]>=z0:B[1]<=z0;if(aa)out.push(A);if(aa!==bb){const t=(z0-A[1])/(B[1]-A[1]);out.push([A[0]+(B[0]-A[0])*t,z0]);}}return out;};
 for(let zz=-rz;zz<rz;zz+=.53){
  const poly=clip(clip(hex,zz+.025,true),zz+.505,false);if(poly.length<3)continue;
  const pos=[];for(let i=1;i<poly.length-1;i++)for(const v of[poly[0],poly[i],poly[i+1]])pos.push(x+v[0],PL+.012,z+v[1]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();woodParts.push(coloredPart(g,pick(['#a68b5d','#ad9566','#9b8259','#b29b6b'])));
 }
 for(let i=0;i<6;i++){
  const a=Math.PI/6+i/6*6.283,b=a+Math.PI/3,A=p(a),B=p(b),post=.43;
  woodBox(A.x,PL+H/2,A.z,post,H,post,'#90764c');
  woodBox(A.x,PL+.16,A.z,.62,.32,.62,'#776849');
  woodBeam(p(a,r,H-.10),p(b,r,H-.10),.27,'#866a43');woodBeam(p(a,r,0),p(b,r,0),.19,'#8e744c');
  for(const t of[.22,.78]){const E=A.clone().lerp(B,t);E.y=PL+H-.18;const C=t<.5?p(a,r,H*.73):p(b,r,H*.73);woodBeam(C,E,.18,'#967c4e');}
  COLLIDERS.push({x:A.x,z:A.z,r:.34});
  // The front bay is completely open. Benches/rails follow the other five sides.
  if(i!==5){
   const mid=A.clone().add(B).multiplyScalar(.5),edge=B.clone().sub(A),len=edge.length()*.75,yaw=Math.atan2(-edge.z,edge.x),inward=new V3(x-mid.x,0,z-mid.z).normalize();mid.addScaledVector(inward,.40);
   woodBox(mid.x,PL+.80,mid.z,len,.15,.63,'#b59a65',yaw);
   for(const f of[-.33,.33]){const q=mid.clone().addScaledVector(edge,f);woodBox(q.x,PL+.39,q.z,.16,.78,.16,'#8c744c');}
   const back=mid.clone().addScaledVector(inward,-.30);for(const yy of[1.24,1.57])woodBox(back.x,PL+yy,back.z,len,.17,.13,'#a98c57',yaw);
   COLLIDERS.push({x:mid.x,z:mid.z,w:len,d:.76,ry:yaw,box:true});
  }
  // A woody climbing stem, small leaves and loose rose clusters on each post.
  const points=[];for(let k=0;k<=32;k++){const f=k/32,aa=f*6.283*1.55+i*.8;points.push(new V3(A.x+Math.cos(aa)*.32,PL+H*f,A.z+Math.sin(aa)*.32));}
  woodParts.push(coloredPart(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.045,5,false),'#687448'));
  for(let k=1;k<25;k++){
   const v=points[Math.round(k/25*32)],normal=new V3(Math.sin(k*2.4),.4,Math.cos(k*2.4)).normalize();vineLeafItems.push({p:v.clone().addScaledVector(normal,.19),normal,s:R(.32,.47)});
   if(k%3===0)for(let j=0;j<2;j++)addRose(v.clone().add(new V3(R(-.24,.24),R(-.12,.25),.18)),R(.20,.30),pick(['#efc4ad','#f3ded0','#d99791']),new V3(R(-.4,.4),.6,.8));
  }
 }
 const roofPos=[],roofColors=[],tri=(A,B,C,c)=>{for(const q of[A,B,C]){roofPos.push(q.x,q.y,q.z);roofColors.push(c.r,c.g,c.b);}};
 for(let side=0;side<6;side++){
  const a=Math.PI/6+side/6*6.283,b=a+Math.PI/3,edge0=p(a,roofR,H),edge1=p(b,roofR,H),peak=new V3(x,PL+H+roofH,z);
  const baseTone=new THREE.Color('#81724d');tri(edge0,edge1,peak,baseTone);
  const point=(t,f)=>{const v=edge0.clone().lerp(edge1,t),rr=Math.pow(1-f,.90);v.x=x+(v.x-x)*rr;v.z=z+(v.z-z)*rr;v.y=PL+H+roofH*f+.035;return v;};
  for(let j=0;j<12;j++)for(let k=-1;k<8;k++){
   const f0=j/12,f1=Math.min(1,(j+1)/12+.006),shift=(j%2)*.5,t0=Math.max(0,(k+shift)/8)+.003,t1=Math.min(1,(k+1+shift)/8)-.003;if(t1<=t0)continue;const A=point(t0,f0),B=point(t1,f0),C=point(t1,f1),D=point(t0,f1),tone=new THREE.Color(pick(['#9c8d60','#a19062','#97875a','#ab9868','#a69769','#969764']));
   tri(A,B,C,tone);tri(A,C,D,tone);
  }
  woodBeam(edge0,edge1,.23,'#887344');
  for(let k=0;k<9;k++){
   if(rand()<.20)continue;const v=edge0.clone().lerp(edge1,k/8);for(let j=0;j<4;j++)addRose(v.clone().add(new V3(R(-.32,.32),R(-.55,.14),R(-.28,.28))),R(.22,.34),pick(['#efd0bb','#f0bba8','#d8938d']),new V3(v.x-x,.8*(r),v.z-z).normalize());
  }
 }
 const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(roofPos,3));roof.setAttribute('color',new THREE.Float32BufferAttribute(roofColors,3));roof.computeVertexNormals();woodParts.push(roof);
 for(const[yy,rr,hh]of[[0,.20,.35],[.31,.13,.38],[.66,.08,.33]]){const g=new THREE.ConeGeometry(rr,hh,8);g.translate(x,PL+H+roofH+yy+hh/2,z);woodParts.push(coloredPart(g,'#b8a174'));}
 GAZEBO={x,z,r,rz,height:H+roofH,entry:{x,z:z+rz*.91},center:{x,z}};
}
