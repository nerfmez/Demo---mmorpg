function legacyLedges(){
 // The approved short flights. Only replayed for their seeded draws.
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
function buildLedges(){
 // Replay the approved flights' seeded draws so every later rock, tree and
 // collider keeps its place; their pieces are discarded and rebuilt below.
 const parts=stoneParts.length,lines=stoneLines.length;
 legacyLedges();stoneParts.length=parts;stoneLines.length=lines;
 const resume=seed;seed=7919;
 stoneStairs();
 seed=resume;
}
function stoneStairs(){
 // One continuous stair along each authored flight: a course of grey stones every
 // STEP along the route, square to its smoothed direction. Each course is level,
 // so its front edge stands proud of the slope as a riser.
 const STEP=.42*K,STAIR=['#bdb8b6','#c9c4c0','#b4afb0','#c4beb9'];
 for(const route of ROUTES){
  const steep=new Map();
  route.rows.forEach((r,i)=>{
   const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)];
   steep.set(r.section,Math.max(steep.get(r.section)||0,Math.abs(B.y-A.y)/Math.max(.1,Math.hypot(B.x-A.x,B.z-A.z))));
  });
  let next=-Infinity,course=0;
  route.rows.forEach((r,i)=>{
   if(!((route.id==='gazebo'&&r.section<=2)||(route.id==='right'&&r.section>=5&&r.section<=7))||r.s<next)return;
   next=r.s+STEP;course++;
   const A=route.rows[Math.max(0,i-3)],B=route.rows[Math.min(route.n-1,i+3)],l=Math.hypot(B.x-A.x,B.z-A.z)||1;
   const ux=(B.x-A.x)/l,uz=(B.z-A.z)/l,nx=uz,nz=-ux,ry=Math.atan2(ux,uz);
   // Each course is a level step: its top is the ground at its uphill edge, so
   // the course below shows a riser instead of lying as a tile on the ramp.
   const n=Math.max(2,Math.round(r.w/(.95*K))),w=r.w/n;
   for(let j=0;j<n;j++){
    const off=-r.w/2+(j+.5)*w,x=r.x+nx*off,z=r.z+nz*off;
    const a=height(x-ux*STEP/2,z-uz*STEP/2),b=height(x+ux*STEP/2,z+uz*STEP/2),lo=Math.min(a,b),hi=Math.max(a,b);
    block(x,lo-.2,z,w*R(.96,.99),hi-lo+.26,STEP*R(1.0,1.04),ry+R(-.02,.02),.04,{ink:.006*K,base:pick(STAIR)});
   }
   // Low, broken shoulders frame the flight without narrowing its clear width.
   if(course%2===0)for(const side of[-1,1]){
    const off=side*(r.w/2+.24),x=r.x+nx*off,z=r.z+nz*off;
    block(x,height(x,z)-.16,z,.46,.42+.10*Math.sin(i),STEP*1.25,ry,.14,{ink:.004*K,base:'#b9b4b1'});
   }
  });
 }
}
