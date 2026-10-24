function buildLedges(){
 // Short flights mark steeper portions; the shared ribbon continues underneath
 // the packed-earth landings and across every join.
 for(const route of ROUTES)route.rows.forEach((r,i)=>{
  const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)],dist=Math.hypot(B.x-A.x,B.z-A.z),grade=Math.abs(B.y-A.y)/Math.max(.1,dist);
  const f=i/(route.n-1);
  const flight=(route.id==='gazebo'&&[0,1,2].includes(r.section))||(route.id==='right'&&[5,6,7].includes(r.section));
  if(!flight||i%7===3)return;
  const depth=dist/(i===0||i===route.n-1?1:2)+.03,n=Math.max(3,Math.round(r.w/(.64*K))),w=r.w/n;
  for(let j=0;j<n;j++){
   const offset=-r.w/2+(j+.5)*w,x=r.x+r.nx*offset,z=r.z+r.nz*offset;
   const jitter=(Math.sin(i*7.3+j*5.7))*.025*K;
   block(x,height(x,z)-.08+jitter*.25,z,w*(.92+.025*Math.sin(i+j)),.16,depth*(.92+.05*Math.sin(i+j*1.9)),Math.atan2(r.ux,r.uz)+jitter*.10,.09,{ink:.003*K,base:pick(['#bdb69f','#d1c8b0','#c5bda5','#d9cfb6'])});
  }
  // Low, broken shoulders finish each flight, without narrowing its clear width.
  if(i%2===0)for(const side of[-1,1]){
   const off=side*(r.w/2+.21),x=r.x+r.nx*off,z=r.z+r.nz*off;
   block(x,height(x,z)-.14,z,.48,.38+.12*Math.sin(i),depth*1.30,Math.atan2(r.ux,r.uz),.12,{ink:0,base:'#c3bda7'});
  }
 });
}
