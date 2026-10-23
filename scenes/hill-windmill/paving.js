function buildLedges(){
 // Short flights mark steeper portions; the shared ribbon continues underneath
 // the packed-earth landings and across every join.
 for(const route of ROUTES)route.rows.forEach((r,i)=>{
  const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)],dist=Math.hypot(B.x-A.x,B.z-A.z),grade=Math.abs(B.y-A.y)/Math.max(.1,dist);
  const f=i/(route.n-1);
  const flight=route.id==='left'?grade>.22:route.id==='shortcut'?f>.12&&f<.30&&grade>.20:route.id==='right'?((f>.54&&f<.61)||(f>.78&&f<.84)):f>.34&&f<.44;
  if(!flight)return;
  const depth=dist/(i===0||i===route.n-1?1:2)+.03,n=Math.max(4,Math.round(r.w/(.48*K))),w=r.w/n;
  for(let j=0;j<n;j++){
   const offset=-r.w/2+(j+.5)*w,x=r.x+r.nx*offset,z=r.z+r.nz*offset;
   block(x,height(x,z)-.07,z,w*.95,.14,depth*.94,Math.atan2(r.ux,r.uz),.13,{ink:.004*K,base:pick(['#c2b89d','#d4c7a8','#c9bea3'])});
  }
 });
}
