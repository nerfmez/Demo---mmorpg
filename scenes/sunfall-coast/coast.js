// The coast: the waterline traced on screen. The sea shader works in a frame along it: x runs along
// the shore, z out to sea, so the approved beach water (built for a shore across the screen) lies
// against this coast. seaDist is negative on land. Under the arch the sea meets the cliff's foot;
// below it the water runs up a sand beach, so each point carries how far out from its traced line
// the water meets the land: [u, v, plane, out].
const BEACH_OUT=-M(1.55);
const COAST_UVH=[[.70,-.25,SEA_Y,M(.15)],[.75,.05,SEA_Y,M(.15)],[.81,.14,SEA_Y,M(.15)],[.80,.22,SEA_Y,M(.15)],[.75,.31,SEA_Y,M(.15)],[.705,.42,SEA_Y,M(.15)],
 [.665,.48,SEA_FLOOR,BEACH_OUT],[.672,.58,SEA_FLOOR,BEACH_OUT],[.69,.68,SEA_FLOOR,BEACH_OUT],[.715,.78,SEA_FLOOR,BEACH_OUT],[.75,.87,SEA_FLOOR,BEACH_OUT],[.80,.95,SEA_FLOOR,BEACH_OUT],[.88,1.03,SEA_FLOOR,BEACH_OUT],[1.0,1.08,SEA_FLOOR,BEACH_OUT],[1.5,1.15,SEA_FLOOR,BEACH_OUT]];
const COAST=COAST_UVH.map(([u,v,h])=>P(u,v,h)),COAST_OUT=COAST_UVH.map(c=>c[3]);
const SEA_FRAME=(()=>{
 const[ox,oz]=COAST[0],[ex,ez]=COAST.at(-1),l=Math.hypot(ex-ox,ez-oz),ax=(ex-ox)/l,az=(ez-oz)/l;
 // out to sea: the side of the line away from the clearing
 const[px,pz]=P(.40,.65,0);let cx=-az,cz=ax;if((px-ox)*cx+(pz-oz)*cz>0){cx=-cx;cz=-cz;}
 return{ox,oz,ax,az,cx,cz};
})();
const seaQ=(x,z)=>{const F=SEA_FRAME,dx=x-F.ox,dz=z-F.oz;return[dx*F.ax+dz*F.az,dx*F.cx+dz*F.cz];};
const COAST_Q=COAST.map(([x,z],i)=>{const[s,d]=seaQ(x,z);return[s,d+COAST_OUT[i]];});
function shoreAt(s){
 const Q=COAST_Q;if(s<=Q[0][0])return Q[0][1];
 for(let i=1;i<Q.length;i++)if(s<Q[i][0]){const t=(s-Q[i-1][0])/(Q[i][0]-Q[i-1][0]);return Q[i-1][1]+(Q[i][1]-Q[i-1][1])*t+.16*Math.sin(s*.7);}
 return Q.at(-1)[1];
}
function seaDist(x,z){const[s,d]=seaQ(x,z);return d-shoreAt(s);}
const SHORE_GLSL=(()=>{
 const F=SEA_FRAME,f=v=>v.toFixed(5),Q=COAST_Q;
 let g=`const float SEA_YG=${f(SEA_Y)};\nvec2 seaQ(vec2 p){p-=vec2(${f(F.ox)},${f(F.oz)});return vec2(dot(p,vec2(${f(F.ax)},${f(F.az)})),dot(p,vec2(${f(F.cx)},${f(F.cz)})));}\nfloat zShoreG(float x){`;
 g+=`if(x<${f(Q[0][0])})return ${f(Q[0][1])};`;
 for(let i=1;i<Q.length;i++)g+=`if(x<${f(Q[i][0])})return mix(${f(Q[i-1][1])},${f(Q[i][1])},(x-(${f(Q[i-1][0])}))/${f(Q[i][0]-Q[i-1][0])})+.16*sin(x*.7);`;
 return g+`return ${f(Q.at(-1)[1])};}`;
})();
// the water plane: from the coast out past the frame's right edge
const[SEA_CX,SEA_CZ,SEA_W,SEA_D]=(()=>{const c=[P(.55,-.35,SEA_Y),P(1.6,-.35,SEA_Y),P(1.6,1.3,SEA_Y),P(.55,1.3,SEA_Y)],xs=c.map(p=>p[0]),zs=c.map(p=>p[1]);
 return[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2,Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs)];})();
