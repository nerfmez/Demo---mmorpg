// Authoring coordinates follow the reference; all consumers use the same real
// XZ routes, heights and widths. Shared anchors are actual walking junctions.
const ROAD_NODES={
 arrival:[.50,.81,0,.100],
 fork:[.52,.675,0,.125],
 orchard:[.275,.415,.10,.055],
 gardenEntry:[.43,.355,.25,.036],
 eastFork:[.84,.42,.10,.063],
 villageBend:[.865,.31,.20,.055]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.64,1.18,0,.104],[.60,1.02,0,.105],[.55,.90,0,.103],ROAD_NODES.arrival,ROAD_NODES.fork]},
 {id:'left',pts:[ROAD_NODES.fork,[.43,.61,0,.086],[.36,.55,0,.074],[.31,.49,0,.062],[.29,.45,0,.055],ROAD_NODES.orchard,[.245,.365,.35,.053],[.225,.32,.65,.050],[.21,.275,.95,.049],[.185,.23,1.25,.048],[.175,.19,1.55,.048],[.17,.155,1.85,.047],[.155,.12,2.05,.046],[.165,.08,2.25,.050],[.20,.04,2.4,.054],[.185,-.13,2.40,.056]]},
 {id:'village',pts:[ROAD_NODES.fork,[.64,.63,0,.095],[.73,.55,0,.085],[.79,.49,.02,.073],ROAD_NODES.eastFork,ROAD_NODES.villageBend,[.87,.25,.25,.047],[.87,.205,.25,.043],[.87,.12,.25,.043],[.86,.025,.25,.046],[.86,-.13,.25,.050]]},
 {id:'well',pts:[ROAD_NODES.orchard,[.35,.375,.25,.040],ROAD_NODES.gardenEntry,[.465,.368,.25,.034],[.49,.385,.25,.031]]},
 {id:'orchard-loop',pts:[ROAD_NODES.gardenEntry,[.46,.295,.25,.028],[.54,.25,.25,.028],[.65,.23,.25,.030],[.77,.245,.25,.032],ROAD_NODES.villageBend]},
 {id:'west',pts:[ROAD_NODES.arrival,[.35,.815,0,.058],[.18,.80,0,.052],[.04,.82,0,.052],[-.14,.83,0,.054]]},
 {id:'east',pts:[ROAD_NODES.eastFork,[.94,.405,.10,.048],[1.12,.40,.10,.052]]}
];
const ROAD_CELL=M(3);
const ROAD_GRID=new Map();
// Numeric cell keys: a string key per lookup made stairsAt one of the costliest startup calls.
const roadKey=(ix,iz)=>ix*65536+iz;
const ROUTES=ROUTE_SPECS.map(spec=>{
 const anchors=spec.pts.map(([u,v,h,w])=>{const y=M(h),[x,z]=P(u,v,y);return{x,z,y,w:wide(u-w/2,u+w/2,v,y)};});
 const curve=new THREE.CatmullRomCurve3(anchors.map(p=>new V3(p.x,p.y,p.z)),false,'centripetal');
 const n=Math.max(28,Math.ceil(curve.getLength()/.72)),rows=[];let length=0;
 for(let i=0;i<n;i++){
  const t=i/(n-1),p=curve.getPoint(t),f=t*(anchors.length-1),j=Math.min(anchors.length-2,Math.floor(f)),k=f-j,d=curve.getTangent(t),len=Math.hypot(d.x,d.z),ux=d.x/len,uz=d.z/len;
  p.y=THREE.MathUtils.clamp(p.y,Math.min(anchors[j].y,anchors[j+1].y),Math.max(anchors[j].y,anchors[j+1].y));
  if(i)length+=Math.hypot(p.x-rows[i-1].x,p.z-rows[i-1].z);
  rows.push({x:p.x,y:p.y,z:p.z,w:anchors[j].w+(anchors[j+1].w-anchors[j].w)*k,ux,uz,nx:uz,nz:-ux,s:length,section:j});
 }
 const route={id:spec.id,rows,n,len:length,bank:M(.70),half:rows.reduce((s,r)=>s+r.w,0)/n/2};
 // Local lookup avoids scanning the whole road network per terrain vertex.
 for(let i=0;i<n-1;i++){
  const A=rows[i],B=rows[i+1],pad=Math.max(A.w,B.w)/2+M(1.7),segment={A,B,route};
  for(let ix=Math.floor((Math.min(A.x,B.x)-pad)/ROAD_CELL);ix<=Math.floor((Math.max(A.x,B.x)+pad)/ROAD_CELL);ix++)for(let iz=Math.floor((Math.min(A.z,B.z)-pad)/ROAD_CELL);iz<=Math.floor((Math.max(A.z,B.z)+pad)/ROAD_CELL);iz++){
   const key=roadKey(ix,iz);if(!ROAD_GRID.has(key))ROAD_GRID.set(key,[]);ROAD_GRID.get(key).push(segment);
  }
 }
 return route;
});
const ROAD_JUNCTIONS=Object.entries(ROAD_NODES).map(([id,[u,v,h,w]])=>{const y=M(h),[x,z]=P(u,v,y);return{id,x,y,z,r:wide(u-w/2,u+w/2,v,y)*.48};});
const ST={...ROUTES.find(r=>r.id==='left'),top:M(2.4),bank:M(.70)};
const NO_SEGMENTS=[];
function stairsAt(x,z){
 let result={a:-10,s:1e9,y:0,half:0,inside:false},best=1e9,bA=null,bB=null,bRoute=null,bT=0,bDistance=0,bHalf=0;
 const segments=ROAD_GRID.get(roadKey(Math.floor(x/ROAD_CELL),Math.floor(z/ROAD_CELL)))||NO_SEGMENTS;
 for(const{A,B,route}of segments){
  const dx=B.x-A.x,dz=B.z-A.z,l2=dx*dx+dz*dz,t=THREE.MathUtils.clamp(((x-A.x)*dx+(z-A.z)*dz)/l2,0,1);
  const distance=Math.hypot(x-A.x-dx*t,z-A.z-dz*t),half=(A.w+(B.w-A.w)*t)/2,edge=distance-half;
  if(edge<best){best=edge;bA=A;bB=B;bRoute=route;bT=t;bDistance=distance;bHalf=half;}
 }
 // The winning segment's record is built once, with the same arithmetic as before.
 if(bA)result={a:(bA.s+(bB.s-bA.s)*bT)/bRoute.len,s:bDistance,y:bA.y+(bB.y-bA.y)*bT,half:bHalf,route:bRoute.id,inside:bDistance<bHalf+.12};
 for(const j of ROAD_JUNCTIONS){
  const d=Math.hypot(x-j.x,z-j.z),blend=1-smooth(j.r*.42,j.r+M(.22),d);
  if(blend>0)result.y=THREE.MathUtils.lerp(result.y,j.y,blend);
 }
 return result;
}
// World-space handles for later game placement. Translate with the terrain.
const MEADOW_PORTS=[['south','south',0],['northwest','left',-1],['village','village',-1],['west','west',-1],['east','east',-1]].map(([id,routeId,index])=>{
 const route=ROUTES.find(r=>r.id===routeId),p=route.rows.at(index),sign=index===0?-1:1;
 return{id,route:routeId,x:p.x,y:p.y,z:p.z,width:p.w,dx:p.ux*sign,dz:p.uz*sign};
});
