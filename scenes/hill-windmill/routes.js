// Coordinates are authored on the reference, with real height in concept metres.
const ROUTE_SPECS=[
 {id:'right',pts:[[.50,.88,0,.086],[.61,.81,0,.075],[.73,.75,.20,.060],[.81,.68,.55,.050],[.855,.60,1.00,.045],[.85,.525,1.38,.046],[.79,.454,1.90,.050],[.71,.404,2.30,.060],[.615,.412,2.30,.055]]},
 {id:'left',pts:[[.50,.88,0,.086],[.39,.75,0,.075],[.30,.66,.18,.060],[.25,.60,.55,.053],[.21,.54,.88,.048],[.19,.485,1.25,.046],[.19,.425,1.50,.047],[.215,.35,1.95,.050],[.22,.29,2.40,.050],[.24,.235,2.60,.055]]},
 {id:'shortcut',pts:[[.46,.78,0,.06],[.48,.70,.10,.055],[.515,.645,.70,.045],[.60,.61,1.02,.050],[.69,.567,1.42,.052],[.75,.52,1.78,.050],[.78,.46,1.90,.050]]},
 {id:'east',pts:[[.79,.72,.45,.052],[.87,.64,.65,.045],[.91,.56,.95,.045],[.92,.485,1.30,.052],[.91,.425,1.75,.045]]}
];
const ROUTES=ROUTE_SPECS.map(spec=>{
 const anchors=spec.pts.map(([u,v,h,w])=>{const y=M(h),[x,z]=P(u,v,y);return{x,z,y,w:wide(u-w/2,u+w/2,v,y)};});
 const curve=new THREE.CatmullRomCurve3(anchors.map(p=>new V3(p.x,p.y,p.z)),false,'centripetal');
 const n=Math.max(36,Math.ceil(curve.getLength()/.9)),rows=[];let length=0;
 for(let i=0;i<n;i++){
  const t=i/(n-1),p=curve.getPoint(t),f=t*(anchors.length-1),j=Math.min(anchors.length-2,Math.floor(f)),k=f-j,d=curve.getTangent(t),len=Math.hypot(d.x,d.z),ux=d.x/len,uz=d.z/len;
  if(i)length+=Math.hypot(p.x-rows[i-1].x,p.z-rows[i-1].z);
  rows.push({x:p.x,y:p.y,z:p.z,w:anchors[j].w+(anchors[j+1].w-anchors[j].w)*k,ux,uz,nx:uz,nz:-ux,s:length});
 }
 return{id:spec.id,rows,n,len:length,bank:M(.8),half:rows.reduce((s,r)=>s+r.w,0)/n/2};
});
const ST={...ROUTES[1],top:M(2.6),x0:ROUTES[1].rows[0].x,z0:ROUTES[1].rows[0].z,x1:ROUTES[1].rows.at(-1).x,z1:ROUTES[1].rows.at(-1).z};
function stairsAt(x,z){
 let result={a:-10,s:1e9,y:0,half:0,inside:false},best=1e9;
 for(const route of ROUTES)for(let i=0;i<route.n-1;i++){
  const A=route.rows[i],B=route.rows[i+1],dx=B.x-A.x,dz=B.z-A.z,l2=dx*dx+dz*dz;
  const t=THREE.MathUtils.clamp(((x-A.x)*dx+(z-A.z)*dz)/l2,i===0?-.5:0,i===route.n-2?1.5:1),f=THREE.MathUtils.clamp(t,0,1);
  const distance=Math.hypot(x-A.x-dx*t,z-A.z-dz*t),half=(A.w+(B.w-A.w)*f)/2,edge=distance-half;
  if(edge<best){best=edge;result={a:(A.s+(B.s-A.s)*t)/route.len,s:distance,y:A.y+(B.y-A.y)*f,half,route:route.id,inside:t>=-.03&&t<=1.03&&distance<half+.12};}
 }
 return result;
}
