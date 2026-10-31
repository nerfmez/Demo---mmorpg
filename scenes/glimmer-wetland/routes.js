// Glimmer Wetland routes. Authoring coordinates follow the reference ([u, v, height in concept metres,
// width as a screen fraction]). From the south the earth path forks between the pools: one way runs
// up-left between the big pool and the middle one and on west, with a branch north past the willows;
// the other runs up-right between the middle pool and the right one and on east, with a branch
// north-west round the crystal's rock.
const ROAD_NODES={
 fork:[.53,.60,0,.15],
 west:[.25,.335,0,.07],
 east:[.775,.345,0,.07]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.50,1.18,0,.14],[.50,1.0,0,.15],[.51,.85,0,.15],[.52,.72,0,.14],ROAD_NODES.fork]},
 {id:'northwest',pts:[ROAD_NODES.fork,[.47,.53,0,.10],[.43,.47,0,.085],[.39,.42,0,.075],[.33,.375,0,.07],ROAD_NODES.west,[.16,.31,0,.065],[.07,.30,0,.062],[-.15,.28,0,.06]]},
 {id:'north',pts:[ROAD_NODES.west,[.19,.27,0,.058],[.16,.20,0,.055],[.165,.12,0,.052],[.18,.04,0,.05],[.20,-.15,0,.048]]},
 {id:'east',pts:[ROAD_NODES.fork,[.61,.535,0,.10],[.68,.48,0,.085],[.725,.43,0,.075],[.745,.385,0,.07],ROAD_NODES.east,[.85,.315,0,.065],[.93,.305,0,.062],[1.15,.29,0,.06]]},
 {id:'northeast',pts:[ROAD_NODES.east,[.73,.30,0,.062],[.67,.25,0,.058],[.615,.20,0,.055],[.59,.12,0,.052],[.58,.04,0,.05],[.57,-.15,0,.048]]}
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
// the wetland is all on one level: no stone stair (the paving step finds no climbing route)
const ST={...ROUTES[0],top:0,bank:M(.70)};
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
const WETLAND_PORTS=[['south','south',0],['west','northwest',-1],['north','north',-1],['east','east',-1],['northeast','northeast',-1]].map(([id,routeId,index])=>{
 const route=ROUTES.find(r=>r.id===routeId),p=route.rows.at(index),sign=index===0?-1:1;
 return{id,route:routeId,x:p.x,y:p.y,z:p.z,width:p.w,dx:p.ux*sign,dz:p.uz*sign};
});
