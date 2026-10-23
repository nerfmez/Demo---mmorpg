// Authoring coordinates follow the reference; all consumers use the same real
// XZ routes, heights and widths. Shared anchors are actual walking junctions.
const ROAD_NODES={
 arrival:[.50,.81,0,.116],
 leftFork:[.32,.52,.05,.080],
 orchard:[.31,.46,.10,.074],
 wellEntry:[.49,.525,.05,.050],
 eastFork:[.83,.42,.25,.088],
 villageBend:[.86,.34,.38,.085]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.64,1.18,0,.115],[.60,1.02,0,.116],[.55,.90,0,.115],ROAD_NODES.arrival]},
 {id:'left',pts:[ROAD_NODES.arrival,[.41,.69,0,.104],[.35,.60,0,.089],ROAD_NODES.leftFork,ROAD_NODES.orchard,[.27,.395,.12,.073],[.245,.35,.48,.068],[.22,.29,.90,.063],[.20,.25,1.20,.060],[.18,.20,1.50,.058],[.155,.16,1.72,.055],[.15,.12,2.02,.056],[.17,.075,2.28,.057],[.20,.025,2.40,.060],[.18,-.13,2.40,.062]]},
 {id:'village',pts:[ROAD_NODES.arrival,[.63,.69,0,.108],[.72,.58,.04,.098],[.78,.50,.12,.092],ROAD_NODES.eastFork,ROAD_NODES.villageBend,[.85,.28,.52,.079],[.87,.215,.65,.076],[.87,.145,.65,.067],[.86,.03,.65,.068],[.86,-.13,.65,.072]]},
 {id:'garden-front',pts:[ROAD_NODES.leftFork,[.40,.56,.025,.050],ROAD_NODES.wellEntry,[.61,.545,.08,.050],[.72,.505,.16,.055],ROAD_NODES.eastFork]},
 {id:'well',pts:[ROAD_NODES.wellEntry,[.52,.48,.40,.043],[.558,.459,.65,.032]]},
 {id:'orchard-loop',pts:[ROAD_NODES.orchard,[.39,.375,.65,.044],[.43,.315,.65,.043],[.52,.255,.65,.043],[.64,.24,.65,.043],[.76,.29,.65,.045],ROAD_NODES.villageBend]},
 {id:'west',pts:[ROAD_NODES.arrival,[.35,.815,0,.065],[.18,.80,0,.061],[.04,.82,0,.060],[-.14,.83,0,.062]]},
 {id:'east',pts:[ROAD_NODES.eastFork,[.94,.43,.20,.074],[1.12,.42,.20,.078]]}
];
const ROAD_CELL=M(3);
const ROAD_GRID=new Map();
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
   const key=ix+','+iz;if(!ROAD_GRID.has(key))ROAD_GRID.set(key,[]);ROAD_GRID.get(key).push(segment);
  }
 }
 return route;
});
const ROAD_JUNCTIONS=Object.entries(ROAD_NODES).map(([id,[u,v,h,w]])=>{const y=M(h),[x,z]=P(u,v,y);return{id,x,y,z,r:wide(u-w/2,u+w/2,v,y)*.48};});
const ST={...ROUTES.find(r=>r.id==='left'),top:M(2.4),bank:M(.70)};
function stairsAt(x,z){
 let result={a:-10,s:1e9,y:0,half:0,inside:false},best=1e9;
 const segments=ROAD_GRID.get(Math.floor(x/ROAD_CELL)+','+Math.floor(z/ROAD_CELL))||[];
 for(const{A,B,route}of segments){
  const dx=B.x-A.x,dz=B.z-A.z,l2=dx*dx+dz*dz,t=THREE.MathUtils.clamp(((x-A.x)*dx+(z-A.z)*dz)/l2,0,1);
  const distance=Math.hypot(x-A.x-dx*t,z-A.z-dz*t),half=(A.w+(B.w-A.w)*t)/2,edge=distance-half;
  if(edge<best){best=edge;result={a:(A.s+(B.s-A.s)*t)/route.len,s:distance,y:A.y+(B.y-A.y)*t,half,route:route.id,inside:distance<half+.12};}
 }
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
