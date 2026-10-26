// The pond: its waterline traced on screen at the water's level, closed round a centre. The shore
// is a smooth radius round that centre (a short Fourier series fitted to the trace), so the beach
// water shader, built for one straight shore, can measure "metres inside the water" anywhere on
// it: pondIn is positive on the water, negative on land. seaDist (the coast scenes' name) is the
// same thing.
// the waterline as the reference shows it, [u, v] on the water plane
const POND_UV=[[.275,.36],[.285,.30],[.32,.258],[.38,.245],[.43,.252],[.47,.272],[.52,.288],[.56,.298],[.60,.308],[.655,.33],[.70,.356],[.74,.39],[.765,.435],[.758,.48],[.728,.515],[.665,.535],[.60,.552],[.53,.555],[.47,.532],[.42,.505],[.36,.475],[.31,.445],[.283,.405]];
const POND=(()=>{
 const pts=POND_UV.map(([u,v])=>P(u,v,SEA_Y)),curve=new THREE.CatmullRomCurve3(pts.map(([x,z])=>new V3(x,0,z)),true,'centripetal');
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
})();
function pondRadius(a){let r=POND.cos[0];for(let k=1;k<POND.cos.length;k++)r+=POND.cos[k]*Math.cos(k*a)+POND.sin[k]*Math.sin(k*a);return r;}
function pondIn(x,z){const dx=x-POND.cx,dz=z-POND.cz;return pondRadius(Math.atan2(dz,dx))+.12*Math.sin(Math.atan2(dz,dx)*11)-Math.hypot(dx,dz);}
const seaDist=pondIn;
const SHORE_GLSL=(()=>{
 const f=v=>v.toFixed(5);let r=f(POND.cos[0]);
 for(let k=1;k<POND.cos.length;k++)r+=`+${f(POND.cos[k])}*cos(${k}.*a)+${f(POND.sin[k])}*sin(${k}.*a)`;
 return `const float SEA_YG=${f(SEA_Y)};\nfloat pondIn(vec2 p){vec2 d=p-vec2(${f(POND.cx)},${f(POND.cz)});float a=atan(d.y,d.x);return ${r}+.12*sin(a*11.)-length(d);}\n`;
})();
// the water plane: the pond's box and a margin
const[SEA_CX,SEA_CZ,SEA_W,SEA_D]=(()=>{const r=Math.max(...Array.from({length:72},(_,i)=>pondRadius(i/72*2*Math.PI-Math.PI)))+2;return[POND.cx,POND.cz,r*2,r*2];})();
