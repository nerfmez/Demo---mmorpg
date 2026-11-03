// Original pieces for Sunfall Coast: the great natural rock arch that springs from the sea cliff and
// stands its far leg in the sea, the sea stacks off the beach and the rocks along the sand. Built from
// the shared ruin blocks (pale stone, mossy tops, ink outline) so it reads as the cliff's own rock.
let ARCH=null;
const seaRocks=[];
// the arch: one body of rock swept round half an ellipse in a vertical plane, from the cliff's foot
// (G0) over to its leg in the sea (G1). Its cross-section is a rounded box, jittered so the faces read
// as weathered rock facets; the legs are thicker than the span, the span's top is mossy, and a broken
// crown of blocks, bushes and hanging greenery sits on it, as the concept's.
function rockArch(){
 const[x0,z0]=P(.705,.42,SEA_Y),[x1,z1]=P(.94,.54,SEA_Y),span=Math.hypot(x1-x0,z1-z0),dx=(x1-x0)/span,dz=(z1-z0)/span;
 const cx=(x0+x1)/2,cz=(z0+z1)/2,a=span/2;
 const bOut=tall(cx,cz,SEA_Y,.035),bIn=tall(cx,cz,SEA_Y,.18),b=(bOut+bIn)/2,thick=(bOut-bIn)*1.1,legW=wide(.90,.965,.54,SEA_Y),depth=M(3.6);
 ARCH={x0,z0,x1,z1,cx,cz,a,b,thick,depth,dx,dz};
 // the centre line: up out of the sea, round the half ellipse, back down into the sea at the cliff
 const line=[],J=34,low=SEA_FLOOR-M(.4);
 const at=(e,y,T)=>({e,y,T});
 line.push(at(a,low,legW*.95),at(a,(low+SEA_Y)/2,legW*.9));
 for(let j=0;j<=J;j++){const th=Math.PI*j/J,c0=Math.cos(th),s=Math.pow(Math.sin(th),.6);line.push(at(a*Math.sign(c0)*Math.pow(Math.abs(c0),.8),SEA_Y+b*s,THREE.MathUtils.lerp(j<J/2?legW*.85:legW*1.15,thick,Math.pow(s,1.6))));}
 line.push(at(-a,(low+SEA_Y)/2,legW*1.2),at(-a,low,legW*1.25));
 const S=12,ex=new V3(dx,0,dz),ew=new V3(-dz,0,dx),rings=[];
 line.forEach((q,j)=>{
  const A=line[Math.max(0,j-1)],B=line[Math.min(line.length-1,j+1)];let te=B.e-A.e,ty=B.y-A.y;const l=Math.hypot(te,ty)||1;te/=l;ty/=l;
  // the outward normal in the arch's plane: away from the opening
  let ne=ty,ny=-te;if(ne*q.e+ny*(q.y-SEA_Y)<0){ne=-ne;ny=-ny;}
  const c=new V3(cx,0,cz).addScaledVector(ex,q.e).setY(q.y),ring=[];
  for(let k=0;k<S;k++){
   const f=k/S*Math.PI*2,cr=Math.cos(f),sr=Math.sin(f),jr=1+.09*Math.sin(j*2.1+k*1.7)+.05*Math.sin(j*.7+k*3.9);
   const rr=Math.sign(cr)*Math.pow(Math.abs(cr),.55)*q.T/2*jr,ww=Math.sign(sr)*Math.pow(Math.abs(sr),.55)*depth/2*jr;
   ring.push(c.clone().addScaledVector(ex,ne*rr).add(new V3(0,ny*rr,0)).addScaledVector(ew,ww));
  }
  rings.push(ring);
 });
 const pos=[],col=[],nor=[],m=new THREE.Color(pick(MOSS)),tone=new THREE.Color(),nn=new V3(),u=new V3(),v=new V3();
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<S;k++){
  const kk=(k+1)%S,q=[rings[j][k],rings[j+1][k],rings[j+1][kk],rings[j][kk]];
  for(const tri of[[0,1,2],[0,2,3]]){
   const[A,B,C]=tri.map(i=>q[i]);u.subVectors(B,A);v.subVectors(C,A);nn.crossVectors(u,v).normalize();
   // facets toward the opening's inside must face inwards: the ring winding decides; flip to outward
   const mid=A.clone().add(B).add(C).multiplyScalar(1/3),cen=new V3(cx,0,cz).addScaledVector(ex,line[j].e).setY(line[j].y);
   const order=nn.dot(mid.clone().sub(cen))<0?[A,C,B]:[A,B,C];if(order[1]===C)nn.negate();
   // columnar bands: the tone changes every few rings and round the section, mossy where it faces up
   tone.set(ruinPalette[(Math.floor(j/3)*3+k)%ruinPalette.length]).multiplyScalar(.93+.07*nn.y).lerp(m,.75*smooth(.5,.85,nn.y));
   for(const P0 of order){pos.push(P0.x,P0.y,P0.z);nor.push(nn.x,nn.y,nn.z);col.push(tone.r,tone.g,tone.b);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
 collectStone(g,0,0,0,0,0,0,.02*K);
 // a broken crown and greenery along the top; ivy down the outer face
 for(let j=2;j<line.length-2;j++){
  const q=line[j],s=(q.y-SEA_Y)/b;if(s<.45)continue;
  const A=line[j-1],B=line[j+1];let te=B.e-A.e,ty=B.y-A.y;const l=Math.hypot(te,ty);te/=l;ty/=l;let ne=ty,ny=-te;if(ne*q.e+ny*(q.y-SEA_Y)<0){ne=-ne;ny=-ny;}
  const xt=cx+dx*(q.e+ne*q.T*.45),yt=q.y+ny*q.T*.45,zt=cz+dz*(q.e+ne*q.T*.45);
  if(j%4===0&&rand()<.7)block(xt+R(-.3,.3),yt-M(.2),zt+R(-.3,.3),M(R(.9,1.6)),M(R(.45,.8)),depth*R(.35,.6),Math.atan2(-dz,dx)+R(-.3,.3),.85,{base:pick(ruinPalette),natural:true});
  for(let k=0;k<2;k++){const o=R(-.4,.4)*depth;addBush(xt-dz*o,yt+M(.15),zt+dx*o,M(R(.3,.55)),{sy:R(.5,.75),tint:R(-.1,.25)});}
  if(rand()<.55){const o=(rand()<.5?-1:1)*depth*.48;addBush(xt-dz*o,yt-M(R(.3,.9)),zt+dx*o,M(R(.22,.38)),{sy:R(1.1,1.6),tint:R(-.15,.1)});}
 }
 const[s,d]=seaQ(x1,z1);seaRocks.push([s,d,legW*.6]);
}
// sea stacks off the beach: [u, v at the waterline, width as a screen fraction, top v]
const SEA_STACKS=[[.745,.64,.075,.47],[.765,.79,.055,.69],[.705,.68,.025,.645],[.83,.69,.03,.655],[.885,.84,.035,.80],[.79,.36,.03,.315],[.955,.89,.025,.86]];
function seaStacks(){
 // rugged columnar stacks: a few tilted rock blocks per tier, narrower as they rise, mossy and bushy on top
 for(const[u,v,w,vt]of SEA_STACKS){
  const[x,z]=P(u,v,SEA_Y),width=wide(u-w/2,u+w/2,v,SEA_Y),h=tall(x,z,SEA_Y,vt)+M(.7),ry=R(-.6,.6);
  let y=SEA_Y-M(.9);
  const parts=h>M(2.5)?3:2;
  for(let k=0;k<parts;k++){
   const hh=h*(parts===3?[.42,.34,.26]:[.58,.44])[k],ww=width*[1,.82,.62][k];
   for(let c=0;c<(k<parts-1?3:2);c++){const a=ry+c*2.1+R(-.4,.4),o=c?ww*R(.18,.3):0;block(x+Math.cos(a)*o,y-R(0,.2)*hh,z+Math.sin(a)*o,ww*R(.62,.8),hh*R(.9,1.08),ww*R(.55,.75),ry+R(-.5,.5),k===parts-1?.75:.35,{base:pick(ruinPalette),natural:true,rx:R(-.06,.06),rz:R(-.08,.08)});}
   y+=hh*.92;}
  for(let k=0;k<2;k++)addBush(x+R(-.2,.2)*width,y-.25,z+R(-.2,.2)*width,width*R(.2,.3),{sy:.5,tint:R(-.2,.2)});
  for(let k=0;k<4;k++){const a=R(0,6.28),r=width*R(.55,.85);addStone(x+Math.cos(a)*r,SEA_Y-M(.25),z+Math.sin(a)*r,M(R(.35,.7)),M(R(.4,.8)),M(R(.3,.6)),{extra:7,chamfer:.25,moss:.3,base:pick(ruinPalette),ry:R(0,6)});}
  if(seaRocks.length<8){const[s,d]=seaQ(x,z);seaRocks.push([s,d,width*.55]);}
 }
 while(seaRocks.length<8)seaRocks.push([0,-999,0]);
}
