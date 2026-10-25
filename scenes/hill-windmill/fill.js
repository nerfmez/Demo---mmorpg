// No ravines (owner, 25 October 2026): the narrow channels left between terraces are
// filled. The terrace-only ground is closed (a max then a min over FILL_R), so any dip
// narrower than about twice FILL_R would rise to its lower bank; the fill stops FILL_DROP
// below that bank, so each terrace still ends in a rock face over a shallow floor instead
// of a free-standing wall. The broad lowland stays where it is. Routes ride the fill.
const FILL_R=M(3.4),FILL_DROP=M(.9),FILL_STEP=1;
let FILL=null;
function terraceY(x,z){
  let y=0;
  for(const T of TERRACES){
    const d=polyAt(T,x,z);if(d===null)continue;
    const cliff=polyAt.wall&&T.ledge,w=cliff?1-smooth(-0.35-T.lean,0.05,d):1-smooth(-T.soft,0.25,d);
    const b=T.base||0;if(w>0)y=Math.max(y,b+((T.topAt?T.topAt(x):T.top)-b)*w);
  }
  return y;
}
function fillAt(x,z){
  if(!FILL){
    const nx=Math.ceil((GX1-GX0)/FILL_STEP)+1,nz=Math.ceil((GZ1-GZ0)/FILL_STEP)+1,a=new Float32Array(nx*nz),t=new Float32Array(nx*nz),r=Math.round(FILL_R/FILL_STEP);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)a[j*nx+i]=terraceY(GX0+i*FILL_STEP,GZ0+j*FILL_STEP);
    const pass=(src,dst,op,alongX)=>{for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){let m=src[j*nx+i];for(let k=-r;k<=r;k++){const ii=alongX?i+k:i,jj=alongX?j:j+k;if(ii<0||jj<0||ii>=nx||jj>=nz)continue;const v=src[jj*nx+ii];m=op(m,v);}dst[j*nx+i]=m;}};
    const b=new Float32Array(nx*nz);
    pass(a,t,Math.max,true);pass(t,b,Math.max,false);pass(b,t,Math.min,true);pass(t,b,Math.min,false);
    for(let k=0;k<b.length;k++)b[k]=Math.max(a[k],b[k]-FILL_DROP);
    // soften the filled rims a little so they meet the banks as slopes
    for(let s=0;s<2;s++){pass(b,t,(m,v)=>m,true);for(let j=1;j<nz-1;j++)for(let i=1;i<nx-1;i++){const k=j*nx+i;t[k]=(b[k]*4+b[k-1]+b[k+1]+b[k-nx]+b[k+nx])/8;}for(let k=0;k<b.length;k++)b[k]=Math.max(a[k],t[k]);}
    FILL={nx,nz,b};
  }
  const fx=(x-GX0)/FILL_STEP,fz=(z-GZ0)/FILL_STEP;
  if(fx<0||fz<0||fx>FILL.nx-1.001||fz>FILL.nz-1.001)return 0;
  const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*FILL.nx+i,b=FILL.b;
  return b[k]*(1-u)*(1-v)+b[k+1]*u*(1-v)+b[k+FILL.nx]*(1-u)*v+b[k+FILL.nx+1]*u*v;
}
