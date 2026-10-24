// One curved ribbon drives ground height, paving, vegetation and collision.
// Width and height are interpolated along that same centerline.
const STAIR_ROWS=[
  [.465,.245,.295,0],[.415,.215,.265,.06],
  [.365,.175,.225,.25],[.315,.170,.220,.28],
  [.265,.190,.240,.52],[.215,.215,.265,.55],
  [.160,.255,.305,.78],[.100,.290,.340,1]
];
const ST=(()=>{
  const anchors=STAIR_ROWS.map(([v,u0,u1,f])=>{const y=PL*f,[x,z]=P((u0+u1)/2,v,y);return{x,z,y,w:wide(u0,u1,v,y)};});
  const curve=new THREE.CatmullRomCurve3(anchors.map(p=>new V3(p.x,p.y,p.z)),false,'centripetal');
  const n=48,rows=[];let length=0;
  for(let i=0;i<n;i++){
    const t=i/(n-1),p=curve.getPoint(t),idx=t*(anchors.length-1),j=Math.min(anchors.length-2,Math.floor(idx)),f=idx-j;
    const d=curve.getTangent(t),len=Math.hypot(d.x,d.z),ux=d.x/len,uz=d.z/len;
    if(i)length+=Math.hypot(p.x-rows[i-1].x,p.z-rows[i-1].z);
    rows.push({x:p.x,z:p.z,y:p.y,w:anchors[j].w+(anchors[j+1].w-anchors[j].w)*f,ux,uz,nx:uz,nz:-ux,s:length});
  }
  const a=rows[0],b=rows[n-1];return{rows,n,len:length,half:rows.reduce((s,r)=>s+r.w,0)/n/2,bank:M(1.0),top:PL,x0:a.x,z0:a.z,x1:b.x,z1:b.z,ux:a.ux,uz:a.uz};
})();
function stairsAt(x,z){
  let best=Infinity,result=null;
  for(let i=0;i<ST.n-1;i++){
    const A=ST.rows[i],B=ST.rows[i+1],dx=B.x-A.x,dz=B.z-A.z,l2=dx*dx+dz*dz;
    let t=((x-A.x)*dx+(z-A.z)*dz)/l2;
    t=Math.max(i===0?-.75:0,Math.min(i===ST.n-2?1.75:1,t));
    const qx=A.x+dx*t,qz=A.z+dz*t,d=Math.hypot(x-qx,z-qz);
    if(d<best){best=d;const f=THREE.MathUtils.clamp(t,0,1),s=A.s+(B.s-A.s)*t;result={a:s/ST.len,s:d,y:A.y+(B.y-A.y)*f,half:(A.w+(B.w-A.w)*f)/2};}
  }
  result.inside=result.a>-.025&&result.a<1.035&&result.s<result.half+.10;
  return result;
}
