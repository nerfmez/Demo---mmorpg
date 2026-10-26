// The coast: the waterline traced on screen at sea level. The sea shader works in a frame along it:
// x runs along the shore, z out to sea, so the approved beach water (built for a shore across the
// screen) lies against this diagonal coast. seaDist is negative on land.
// the cliff tops as the reference shows them, [u, v, plane]; the water meets their feet a little further out
const COAST_UVH=[[.47,-.15,PL],[0.49,0.0,PL],[0.52,0.1,PL],[0.56,0.155,PL],[0.61,0.172,PL],[0.66,0.175,PL],[0.71,0.168,PL],[0.77,0.155,PL],[0.83,0.17,PL],[0.87,0.22,PL],[0.9,0.33,PL],[0.895,0.45,PL],[.875,.58,M(1.5)],[.885,.68,M(1.5)],[.93,.74,M(1.5)],[1.0,.78,M(1.5)],[1.5,.82,M(1.5)]];
const COAST=COAST_UVH.map(([u,v,h])=>P(u,v,h)),FOOT_OUT=M(.45);
const SEA_FRAME=(()=>{
 const[ox,oz]=COAST[0],[ex,ez]=COAST.at(-1),l=Math.hypot(ex-ox,ez-oz),ax=(ex-ox)/l,az=(ez-oz)/l;
 // out to sea: the side of the line away from the paths (the screen's lower left)
 const[px,pz]=P(.35,.6,0);let cx=-az,cz=ax;if((px-ox)*cx+(pz-oz)*cz>0){cx=-cx;cz=-cz;}
 return{ox,oz,ax,az,cx,cz};
})();
const seaQ=(x,z)=>{const F=SEA_FRAME,dx=x-F.ox,dz=z-F.oz;return[dx*F.ax+dz*F.az,dx*F.cx+dz*F.cz];};
const COAST_Q=COAST.map(([x,z])=>seaQ(x,z));
function shoreAt(s){
 const Q=COAST_Q;if(s<=Q[0][0])return Q[0][1];
 for(let i=1;i<Q.length;i++)if(s<Q[i][0]){const t=(s-Q[i-1][0])/(Q[i][0]-Q[i-1][0]);return Q[i-1][1]+(Q[i][1]-Q[i-1][1])*t+FOOT_OUT+.16*Math.sin(s*.7);}
 return Q.at(-1)[1]+FOOT_OUT;
}
function seaDist(x,z){const[s,d]=seaQ(x,z);return d-shoreAt(s);}
const SHORE_GLSL=(()=>{
 const F=SEA_FRAME,f=v=>v.toFixed(5),Q=COAST_Q;
 let g=`const float SEA_YG=${f(SEA_Y)};\nvec2 seaQ(vec2 p){p-=vec2(${f(F.ox)},${f(F.oz)});return vec2(dot(p,vec2(${f(F.ax)},${f(F.az)})),dot(p,vec2(${f(F.cx)},${f(F.cz)})));}\nfloat zShoreG(float x){`;
 g+=`if(x<${f(Q[0][0])})return ${f(Q[0][1]+FOOT_OUT)};`;
 for(let i=1;i<Q.length;i++)g+=`if(x<${f(Q[i][0])})return mix(${f(Q[i-1][1]+FOOT_OUT)},${f(Q[i][1]+FOOT_OUT)},(x-(${f(Q[i-1][0])}))/${f(Q[i][0]-Q[i-1][0])})+.16*sin(x*.7);`;
 return g+`return ${f(Q.at(-1)[1]+FOOT_OUT)};}`;
})();
// the water plane: from the coast out past the frame's top right corner
const[SEA_CX,SEA_CZ,SEA_W,SEA_D]=(()=>{const c=[P(.42,-.35,SEA_Y),P(1.6,-.35,SEA_Y),P(1.6,1.2,SEA_Y),P(.42,1.2,SEA_Y)],xs=c.map(p=>p[0]),zs=c.map(p=>p[1]);
 return[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2,Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs)];})();
