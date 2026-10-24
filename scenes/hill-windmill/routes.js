// Authoring coordinates follow the reference; all consumers use the same real
// XZ routes, heights and widths. Shared anchors are actual walking junctions.
const ROAD_NODES={
 arrival:[.50,.86,0,.094],
 fork:[.405,.77,0,.078],
 bend:[.80,.73,.30,.068],
 upper:[.80,.46,1.90,.061],
 upperFork:[.87,.525,1.42,.060]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.53,1.18,0,.100],[.54,1.055,0,.098],[.53,.955,0,.094],ROAD_NODES.arrival]},
 {id:'right',pts:[ROAD_NODES.arrival,[.64,.82,0,.080],ROAD_NODES.bend,[.86,.66,.63,.065],[.88,.59,1.00,.063],ROAD_NODES.upperFork,ROAD_NODES.upper,[.72,.42,2.20,.064],[.66,.409,2.30,.060],[.615,.412,2.30,.055]]},
 {id:'left',pts:[ROAD_NODES.arrival,ROAD_NODES.fork,[.31,.68,.10,.073],[.265,.615,.20,.066],[.225,.57,.45,.062],[.205,.525,.82,.061],[.195,.49,1.10,.060],[.18,.455,1.30,.059],[.175,.418,1.42,.058],[.185,.387,1.47,.057],[.205,.358,1.73,.057],[.225,.326,2.04,.058],[.238,.29,2.22,.052],[.247,.25,2.32,.050],[.245,.20,2.55,.049],[.23,.15,2.65,.049],[.205,.08,2.65,.050],[.20,-.12,2.65,.052]]},
 {id:'shortcut',pts:[ROAD_NODES.fork,[.44,.71,.15,.068],[.485,.666,.65,.061],[.55,.63,1.02,.059],[.63,.59,1.12,.059],[.71,.55,1.48,.060],[.765,.51,1.78,.061],ROAD_NODES.upper]},
 {id:'east',pts:[ROAD_NODES.bend,[.88,.69,.45,.071],[.96,.61,.55,.078],[1.045,.55,.62,.082],[1.16,.535,.70,.085]]},
 {id:'east-north',pts:[ROAD_NODES.upperFork,[.945,.505,1.45,.060],[.95,.425,1.75,.060],[.93,.35,2.22,.060],[.98,.25,2.80,.064],[1.02,.14,2.80,.068]]}
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
const ST={...ROUTES.find(r=>r.id==='left'),top:M(2.65),bank:M(.70)};
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
const HILL_PORTS=[['south','south',0],['northwest','left',-1],['east','east',-1],['northeast','east-north',-1]].map(([id,routeId,index])=>{
 const route=ROUTES.find(r=>r.id===routeId),p=route.rows.at(index),sign=index===0?-1:1;
 return{id,route:routeId,x:p.x,y:p.y,z:p.z,width:p.w,dx:p.ux*sign,dz:p.uz*sign};
});
