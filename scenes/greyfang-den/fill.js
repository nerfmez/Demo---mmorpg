// No ravines (owner, 25 October 2026): the narrow channels left between terraces are
// filled. Across each channel (along x, z and both diagonals) the lower of the two
// highest banks within FILL_R on either side bridges it, so any dip narrower than
// about twice FILL_R rises toward its lower bank, open-ended gullies included. The
// fill stops FILL_DROP below that bank, so each terrace still ends in a rock face over
// a shallow floor instead of a free-standing wall. The broad lowland stays where it is.
// Routes count as banks, and ride the fill.
const FILL_R=M(2.6),FILL_DROP=M(.9),FILL_STEP=1;
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
// Routes run on their own causeways: they bank a channel as a terrace does.
function bankY(x,z){
  const st=stairsAt(x,z),y=terraceY(x,z);
  return st.a>-.03&&st.a<1.04&&st.s<st.half+ST.bank?Math.max(y,st.y):y;
}
function fillAt(x,z){
  if(!FILL){
    const nx=Math.ceil((GX1-GX0)/FILL_STEP)+1,nz=Math.ceil((GZ1-GZ0)/FILL_STEP)+1,a=new Float32Array(nx*nz),t=new Float32Array(nx*nz),r=Math.round(FILL_R/FILL_STEP);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)a[j*nx+i]=bankY(GX0+i*FILL_STEP,GZ0+j*FILL_STEP);
    const pass=(src,dst,op,alongX)=>{for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){let m=src[j*nx+i];for(let k=-r;k<=r;k++){const ii=alongX?i+k:i,jj=alongX?j:j+k;if(ii<0||jj<0||ii>=nx||jj>=nz)continue;const v=src[jj*nx+ii];m=op(m,v);}dst[j*nx+i]=m;}};
    const b=new Float32Array(nx*nz);
    for(const[dx,dz]of[[1,0],[0,1],[1,1],[1,-1]]){
      const reach=dx&&dz?Math.max(1,Math.round(r/Math.SQRT2)):r;
      for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
        let lo=-Infinity,hi=-Infinity;
        for(let k=1;k<=reach;k++){
          const i0=i-dx*k,j0=j-dz*k,i1=i+dx*k,j1=j+dz*k;
          if(i0>=0&&j0>=0&&i0<nx&&j0<nz)lo=Math.max(lo,a[j0*nx+i0]);
          if(i1>=0&&j1>=0&&i1<nx&&j1<nz)hi=Math.max(hi,a[j1*nx+i1]);
        }
        const k=j*nx+i;b[k]=Math.max(b[k],Math.min(lo,hi));
      }
    }
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
