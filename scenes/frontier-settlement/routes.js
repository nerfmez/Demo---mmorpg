// Frontier Settlement routes. Authoring coordinates follow the reference ([u, v, height in concept
// metres, width as a screen fraction]). From the south the road opens into the village square below
// the great tree; a lane runs up-left past the big cottage to a stone stair climbing the bank north-
// west; a lane runs north between the market cottage and the tree; the east road curves away north-
// east past the right-hand cottages.
const ROAD_NODES={
 square:[.55,.60,0,.24],
 foot:[.31,.30,0,.075]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.52,1.18,0,.14],[.52,1.0,0,.15],[.53,.82,0,.16],ROAD_NODES.square]},
 {id:'west',pts:[ROAD_NODES.square,[.48,.48,0,.11],[.42,.40,0,.09],[.36,.34,0,.08],ROAD_NODES.foot]},
 {id:'stair',pts:[ROAD_NODES.foot,[.275,.235,.6,.065],[.245,.17,1.3,.06],[.215,.105,1.9,.058],[.19,.05,2.0,.055],[.17,-.15,2.0,.05]]},
 {id:'north',pts:[ROAD_NODES.square,[.535,.46,0,.1],[.52,.36,0,.085],[.525,.26,0,.075],[.54,.16,0,.07],[.555,.06,0,.065],[.565,-.15,0,.06]]},
 {id:'east',pts:[ROAD_NODES.square,[.66,.52,0,.12],[.75,.46,0,.1],[.83,.39,0,.09],[.885,.29,0,.08],[.92,.18,0,.075],[.95,.06,0,.07],[.98,-.15,0,.065]]}
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
// the shrine stair: paved its whole length (paving.js)
const ST={...ROUTES.find(r=>r.id==='stair'),top:PL,bank:M(.70)};
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
const VILLAGE_PORTS=[['south','south',0],['northwest','stair',-1],['north','north',-1],['northeast','east',-1]].map(([id,routeId,index])=>{
 const route=ROUTES.find(r=>r.id===routeId),p=route.rows.at(index),sign=index===0?-1:1;
 return{id,route:routeId,x:p.x,y:p.y,z:p.z,width:p.w,dx:p.ux*sign,dz:p.uz*sign};
});
