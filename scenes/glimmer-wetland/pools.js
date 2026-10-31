// The pools: each waterline traced on screen at the water's level and closed round its own centre. A
// pool's shore is a smooth radius round that centre (a short Fourier series fitted to the trace), so
// the beach water shader, built for one straight shore, can measure "metres inside the water"
// anywhere: pondIn is positive on the water, negative on land, the nearest pool's. seaDist (the coast
// scenes' name) is the same thing. Mirror Pond's single pond, made several.
const POOLS_UV=[
 // the big pool on the left
 [[-.12,.42],[.02,.40],[.12,.385],[.21,.38],[.29,.395],[.355,.43],[.395,.48],[.41,.545],[.39,.605],[.33,.645],[.24,.66],[.14,.65],[.04,.625],[-.08,.58],[-.14,.50]],
 // the small pool at the top left, under the willows
 [[.20,.17],[.255,.135],[.31,.13],[.355,.15],[.365,.20],[.335,.245],[.28,.26],[.225,.245],[.195,.21]],
 // the middle pool, between the two paths
 [[.395,.285],[.45,.255],[.52,.26],[.58,.275],[.64,.29],[.685,.315],[.70,.355],[.67,.405],[.60,.44],[.52,.455],[.45,.445],[.41,.405],[.385,.345]],
 // the right pool
 [[.775,.395],[.83,.37],[.89,.375],[.945,.40],[.985,.445],[.98,.51],[.93,.55],[.86,.555],[.80,.53],[.765,.48],[.76,.43]]
];
const POOLS=POOLS_UV.map(trace=>{
 const pts=trace.map(([u,v])=>P(u,v,SEA_Y)),curve=new THREE.CatmullRomCurve3(pts.map(([x,z])=>new V3(x,0,z)),true,'centripetal');
 const dense=curve.getSpacedPoints(360).slice(0,-1);
 let cx=0,cz=0;for(const p of dense){cx+=p.x;cz+=p.z;}cx/=dense.length;cz/=dense.length;
 // radius against angle, resampled evenly, then its Fourier terms
 const samples=dense.map(p=>[Math.atan2(p.z-cz,p.x-cx),Math.hypot(p.x-cx,p.z-cz)]).sort((a,b)=>a[0]-b[0]);
 const N=256,even=[];
 for(let i=0;i<N;i++){
  const a=-Math.PI+(i+.5)*2*Math.PI/N;let j=samples.findIndex(s=>s[0]>a);if(j<0)j=0;
  const A=samples[(j-1+samples.length)%samples.length],B=samples[j];let da=B[0]-A[0];if(da<=0)da+=2*Math.PI;let t=a-A[0];if(t<0)t+=2*Math.PI;
  even.push(A[1]+(B[1]-A[1])*Math.min(1,t/da));
 }
 const H=9,cos=[],sin=[];
 for(let k=0;k<=H;k++){let c=0,s=0;for(let i=0;i<N;i++){const a=-Math.PI+(i+.5)*2*Math.PI/N;c+=even[i]*Math.cos(k*a);s+=even[i]*Math.sin(k*a);}cos.push(c/N*(k?2:1));sin.push(s/N*(k?2:1));}
 return{cx,cz,cos,sin};
});
function poolRadius(P0,a){let r=P0.cos[0];for(let k=1;k<P0.cos.length;k++)r+=P0.cos[k]*Math.cos(k*a)+P0.sin[k]*Math.sin(k*a);return r;}
function poolIn(P0,x,z){const dx=x-P0.cx,dz=z-P0.cz,a=Math.atan2(dz,dx);return poolRadius(P0,a)+.12*Math.sin(a*11)-Math.hypot(dx,dz);}
function pondIn(x,z){let m=-1e9;for(const P0 of POOLS)m=Math.max(m,poolIn(P0,x,z));return m;}
const seaDist=pondIn;
const SHORE_GLSL=(()=>{
 const f=v=>v.toFixed(5);let g=`const float SEA_YG=${f(SEA_Y)};\n`;
 POOLS.forEach((P0,i)=>{let r=f(P0.cos[0]);for(let k=1;k<P0.cos.length;k++)r+=`+${f(P0.cos[k])}*cos(${k}.*a)+${f(P0.sin[k])}*sin(${k}.*a)`;
  g+=`float pool${i}(vec2 p){vec2 d=p-vec2(${f(P0.cx)},${f(P0.cz)});float a=atan(d.y,d.x);return ${r}+.12*sin(a*11.)-length(d);}\n`;});
 return g+`float pondIn(vec2 p){return max(max(pool0(p),pool1(p)),max(pool2(p),pool3(p)));}\n`;
})();
// the water plane: every pool's box and a margin
const[SEA_CX,SEA_CZ,SEA_W,SEA_D]=(()=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const P0 of POOLS)for(let i=0;i<72;i++){const a=i/72*2*Math.PI-Math.PI,r=poolRadius(P0,a)+2,x=P0.cx+Math.cos(a)*r,z=P0.cz+Math.sin(a)*r;x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}return[(x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0];})();
