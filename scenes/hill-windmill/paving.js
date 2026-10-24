function legacyLedges(){
 // The approved short flights. Only replayed for their seeded draws.
 // Short flights mark steeper portions; the shared ribbon continues underneath
 // the packed-earth landings and across every join.
 for(const route of ROUTES)route.rows.forEach((r,i)=>{
  const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)],dist=Math.hypot(B.x-A.x,B.z-A.z),grade=Math.abs(B.y-A.y)/Math.max(.1,dist);
  const f=i/(route.n-1);
  const flight=route.id==='left'?((r.section>=3&&r.section<=5)||(r.section>=9&&r.section<=10)):route.id==='shortcut'?r.section===1:route.id==='right'?((f>.60&&f<.65)||(f>.78&&f<.83)):false;
  if(!flight)return;
  const depth=dist/(i===0||i===route.n-1?1:2)+.03,n=Math.max(4,Math.round(r.w/(.48*K))),w=r.w/n;
  for(let j=0;j<n;j++){
   const offset=-r.w/2+(j+.5)*w,x=r.x+r.nx*offset,z=r.z+r.nz*offset;
   const jitter=(Math.sin(i*7.3+j*5.7))*.025*K;
   block(x,height(x,z)-.08+jitter*.25,z,w*(.92+.025*Math.sin(i+j)),.16,depth*.94,Math.atan2(r.ux,r.uz)+jitter*.10,.09,{ink:.003*K,base:pick(['#bdb69f','#d1c8b0','#c5bda5','#d9cfb6'])});
  }
  // Low, broken shoulders finish each flight, without narrowing its clear width.
  if(i%2===0)for(const side of[-1,1]){
   const off=side*(r.w/2+.21),x=r.x+r.nx*off,z=r.z+r.nz*off;
   block(x,height(x,z)-.14,z,.40,.27,depth*1.30,Math.atan2(r.ux,r.uz),.12,{ink:0,base:'#c3bda7'});
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
 // One continuous stair on every steep section: a course of grey stones every
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
   if(!((route.id==='left'?((r.section>=3&&r.section<=5)||(r.section>=9&&r.section<=10)):route.id==='shortcut'?r.section===1:route.id==='right'&&r.section>=2&&r.section<=6)||steep.get(r.section)>=.2)||r.s<next)return;
   next=r.s+STEP;course++;
   const A=route.rows[Math.max(0,i-3)],B=route.rows[Math.min(route.n-1,i+3)],l=Math.hypot(B.x-A.x,B.z-A.z)||1;
   const ux=(B.x-A.x)/l,uz=(B.z-A.z)/l,nx=uz,nz=-ux,ry=Math.atan2(ux,uz);
   const n=Math.max(3,Math.round(r.w/(.62*K))),w=r.w/n;
   for(let j=0;j<n;j++){
    const off=-r.w/2+(j+.5)*w,x=r.x+nx*off,z=r.z+nz*off;
    block(x,height(x,z)-.12,z,w*R(.90,.97),.26,STEP*R(1.0,1.06),ry+R(-.03,.03),.04,{ink:.006*K,base:pick(STAIR)});
   }
   // Low, broken shoulders frame the flight without narrowing its clear width.
   if(course%2===0)for(const side of[-1,1]){
    const off=side*(r.w/2+.24),x=r.x+nx*off,z=r.z+nz*off;
    block(x,height(x,z)-.16,z,.46,.42+.10*Math.sin(i),STEP*1.25,ry,.14,{ink:.004*K,base:'#b9b4b1'});
   }
  });
 }
}
