// Authoring coordinates follow the reference; all consumers use the same real
// XZ routes, heights and widths. Shared anchors are actual walking junctions.
const ROAD_NODES={
 arrival:[.50,.84,0,.105],
 fork:[.53,.695,0,.125],
 westGarden:[.34,.445,.05,.071],
 eastGarden:[.82,.475,.05,.072],
 gazeboFork:[.365,.37,.20,.061],
 northGarden:[.40,.255,.55,.047],
 upperRight:[.825,.235,1.15,.050]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.54,1.18,0,.108],[.52,1.015,0,.108],ROAD_NODES.arrival,ROAD_NODES.fork]},
 {id:'left',pts:[ROAD_NODES.fork,[.415,.66,0,.088],[.31,.61,0,.074],[.275,.55,0,.067],[.29,.49,0,.067],ROAD_NODES.westGarden,ROAD_NODES.gazeboFork,[.39,.315,.40,.054],ROAD_NODES.northGarden,[.43,.19,.65,.047],[.47,.12,.70,.048],[.48,-.13,.70,.052]]},
 {id:'right',pts:[ROAD_NODES.fork,[.66,.665,0,.104],[.76,.61,0,.090],[.82,.55,0,.079],ROAD_NODES.eastGarden,[.83,.425,.15,.065],[.805,.38,.35,.059],[.79,.335,.70,.055],[.80,.29,.95,.053],ROAD_NODES.upperRight,[.85,.17,1.15,.048],[.875,.09,1.15,.050],[.88,-.13,1.15,.054]]},
 {id:'cross',pts:[ROAD_NODES.westGarden,[.45,.48,.05,.057],[.56,.505,.05,.061],[.68,.485,.05,.060],ROAD_NODES.eastGarden]},
 {id:'gazebo',pts:[ROAD_NODES.gazeboFork,[.335,.35,.38,.048],[.30,.345,.62,.045],[.275,.335,.85,.043],[.26,.34,.85,.041],[.25,.315,.85,.048],[.25,.285,.85,.052]]},
 {id:'back',pts:[ROAD_NODES.northGarden,[.49,.265,.55,.037],[.60,.245,.65,.036],[.715,.24,.90,.037],ROAD_NODES.upperRight]},
 {id:'west',pts:[ROAD_NODES.westGarden,[.235,.49,.02,.053],[.14,.555,0,.052],[.04,.58,0,.053],[-.13,.59,0,.056]]},
 {id:'east',pts:[ROAD_NODES.eastGarden,[.935,.48,.05,.053],[1.12,.49,.05,.056]]}
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
const ST={...ROUTES.find(r=>r.id==='left'),top:M(.85),bank:M(.70)};
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
const ROSE_PORTS=[['south','south',0],['northwest','left',-1],['northeast','right',-1],['west','west',-1],['east','east',-1]].map(([id,routeId,index])=>{
 const route=ROUTES.find(r=>r.id===routeId),p=route.rows.at(index),sign=index===0?-1:1;
 return{id,route:routeId,x:p.x,y:p.y,z:p.z,width:p.w,dx:p.ux*sign,dz:p.uz*sign};
});

const PAVILION=(()=>{const[x,z]=P(.25,.275,PL),r=wide(.187,.313,.28,PL)/2;return{x,z,r,rz:r*.73,y:PL};})();
const PAVILION_FLOOR=(()=>{const pts=Array.from({length:6},(_,i)=>{const a=Math.PI/6+i/6*6.283;return{x:PAVILION.x+Math.sin(a)*PAVILION.r,z:PAVILION.z+Math.cos(a)*PAVILION.rz};});return{pts,minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minZ:Math.min(...pts.map(p=>p.z)),maxZ:Math.max(...pts.map(p=>p.z))};})();
