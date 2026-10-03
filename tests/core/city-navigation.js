// Independent traversal probe: flood reachable actor footprints, then verify movement along each route.
export function cityNavigation(world,{spacing=.75}={}){
  const {minX,minZ,maxX,maxZ}=world.bounds;
  const nx=Math.floor((maxX-minX)/spacing)+1,nz=Math.floor((maxZ-minZ)/spacing)+1,total=nx*nz;
  const free=new Uint8Array(total),parent=new Int32Array(total).fill(-1),queue=new Int32Array(total);
  const point=k=>[minX+(k%nx)*spacing,minZ+Math.floor(k/nx)*spacing];
  const index=(x,z)=>Math.round((z-minZ)/spacing)*nx+Math.round((x-minX)/spacing);
  for(let k=0;k<total;k++)if(world.isFree(...point(k),.45))free[k]=1;
  const start=index(...world.data.town.respawn);let head=0,tail=1;queue[0]=start;parent[start]=start;
  while(head<tail){const k=queue[head++],a=point(k);
    for(const n of[k-1,k+1,k-nx,k+nx]){
      if(n<0||n>=total||!free[n]||parent[n]>=0||Math.abs(k%nx-n%nx)>1)continue;
      const b=point(n);if(world.tooSteep(...a,...b))continue;let previous=a,ok=true;
      const walkingSteps=Math.ceil(spacing/.15);
      for(let i=1;i<=walkingSteps;i++){
        const p=[a[0]+(b[0]-a[0])*i/walkingSteps,a[1]+(b[1]-a[1])*i/walkingSteps],moved=world.move(...previous,.45,p[0]-previous[0],p[1]-previous[1]);
        if(Math.hypot(moved.x-p[0],moved.z-p[1])>.005){ok=false;break;}previous=p;
      }
      if(!ok)continue;previous=a;
      const steps=Math.ceil(spacing/.05);
      for(let i=1;i<=steps;i++){
        const p=[a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps];
        const moved=world.move(...previous,.45,p[0]-previous[0],p[1]-previous[1]);
        if(!world.isFree(...p,.45)||Math.hypot(moved.x-p[0],moved.z-p[1])>.005){ok=false;break;}previous=p;
      }
      if(ok){parent[n]=k;queue[tail++]=n;}
    }
  }
  return {visited:tail,path(x,z){
    let best=-1,distance=1.3;const base=index(x,z);
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      const k=base+dx+dz*nx,p=point(k),d=Math.hypot(x-p[0],z-p[1]);
      if(parent[k]>=0&&d<distance){let ok=!world.tooSteep(...p,x,z),previous=p;const steps=Math.max(1,Math.ceil(d/.05));for(let i=1;i<=steps;i++){const q=[p[0]+(x-p[0])*i/steps,p[1]+(z-p[1])*i/steps],moved=world.move(...previous,.45,q[0]-previous[0],q[1]-previous[1]);if(!world.isFree(...q,.45)||Math.hypot(moved.x-q[0],moved.z-q[1])>.005)ok=false;previous=q;}
        if(ok){distance=d;best=k;}}
    }
    if(best<0)return null;const pts=[];
    for(let k=best;;k=parent[k]){pts.push(point(k));if(k===start)break;}
    return [...pts.reverse(),[x,z]];
  }};
}
