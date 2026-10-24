function buildLedges(){
  // Fitted courses turn with the ribbon. Broad landings between flights use
  // the same heightfield; no lateral gaps or slabs crossing the banks.
  ST.rows.forEach((r,i)=>{
    const A=ST.rows[Math.max(0,i-1)],B=ST.rows[Math.min(ST.n-1,i+1)];
    const depth=Math.hypot(B.x-A.x,B.z-A.z)/(i===0||i===ST.n-1?1:2)+.035;
    // Landings stay paved so adjoining flights always have a visible connection.
    const count=Math.max(4,Math.round(r.w/(.44*K))),w=r.w/count;
    for(let j=0;j<count;j++){
      const edge=j===0||j===count-1,offset=-r.w/2+(j+.5)*w;
      const x=r.x+r.nx*offset,z=r.z+r.nz*offset;
      const chip=edge?.90:.965,ry=Math.atan2(r.ux,r.uz);
      block(x,height(x,z)-.065,z,w*chip,.12,depth*.97,ry,.06,{ink:.004*K,base:pick(['#bdb8b6','#c9c4c0','#b4afb0','#c4beb9'])});
    }
  });
  buildPathBanks();
}
function buildPathBanks(){
  const ps=[],cs=[];
  const triangle=(a,b,c,color)=>{
    if(new V3().subVectors(b,a).cross(new V3().subVectors(c,a)).y<0)[b,c]=[c,b];
    for(const p of[a,b,c]){ps.push(p.x,p.y,p.z);cs.push(color.r,color.g,color.b);}
  };
  for(let i=0;i<ST.n-1;i++)for(const side of[-1,1]){
    const A=ST.rows[i],B=ST.rows[i+1];
    const at=(r,t)=>{const d=side*(r.w/2+.035+ST.bank*t),x=r.x+r.nx*d,z=r.z+r.nz*d;return new V3(x,height(x,z)+.045,z);};
    if(Math.max(Math.abs(at(A,0).y-at(A,1).y),Math.abs(at(B,0).y-at(B,1).y))<M(.28))continue;
    for(let j=0;j<3;j++){
      const a=at(A,j/3),b=at(B,j/3),c=at(B,(j+1)/3),d=at(A,(j+1)/3);
      const color=new THREE.Color(['#c2bdb9','#cbc6c2','#b5b0b0'][(i+j)%3]);
      triangle(a,b,c,color);triangle(a,c,d,color);
    }
  }
  if(ps.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));g.computeVertexNormals();stoneParts.push(g);}
}
