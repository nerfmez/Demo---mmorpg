function buildLedges(){
 const resume=seed;seed=7919;
 stoneStairs();
 seed=resume;
}
// A level stone rests on the lowest ground under its footprint, so on a slope or a
// hump it sinks in at the high end instead of hanging over the low end.
function footing(x,z,hw,hd,ux,uz){
 let y=height(x,z);
 for(const a of[-1,1])for(const b of[-1,1])y=Math.min(y,height(x+ux*hd*a+uz*hw*b,z+uz*hd*a-ux*hw*b));
 return y;
}
function stoneStairs(){
 // One continuous stair along each authored flight: a course of grey stones every
 // STEP along the route, square to its smoothed direction. Each course is level,
 // so its front edge stands proud of the slope as a riser.
 const STEP=.42*K,STAIR=['#cfc9bf','#c4beb3','#d8d2c7','#bcb6ab'];
 for(const route of ROUTES){
  const steep=new Map();
  route.rows.forEach((r,i)=>{
   const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)];
   steep.set(r.section,Math.max(steep.get(r.section)||0,Math.abs(B.y-A.y)/Math.max(.1,Math.hypot(B.x-A.x,B.z-A.z))));
  });
  let next=-Infinity,course=0;
  route.rows.forEach((r,i)=>{
   if(route.id!=='stair'||i/(route.n-1)>.97||r.s<next)return;
   {const A=route.rows[Math.max(0,i-2)],B=route.rows[Math.min(route.n-1,i+2)];if(Math.abs(B.y-A.y)/Math.max(.1,Math.hypot(B.x-A.x,B.z-A.z))<.06)return;}
   next=r.s+STEP;course++;
   const A=route.rows[Math.max(0,i-3)],B=route.rows[Math.min(route.n-1,i+3)],l=Math.hypot(B.x-A.x,B.z-A.z)||1;
   const ux=(B.x-A.x)/l,uz=(B.z-A.z)/l,nx=uz,nz=-ux,ry=Math.atan2(ux,uz);
   // each course is a level slab whose top is the route at its front edge: a proper riser
   const rise=Math.abs(B.y-A.y)/Math.max(.1,l)*STEP,h=rise+M(.14),n=Math.max(3,Math.round(r.w/(.62*K))),w=r.w/n;
   for(let j=0;j<n;j++){
    const off=-r.w/2+(j+.5)*w,x=r.x+nx*off,z=r.z+nz*off;
    block(x,r.y+rise/2+.03-h,z,w*R(.92,.98),h,STEP*R(1.02,1.08),ry+R(-.02,.02),.04,{ink:.006*K,base:pick(STAIR)});
   }
  });
 }
}
